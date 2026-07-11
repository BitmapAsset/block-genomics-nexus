import { NextRequest } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { parcelCustomizeBindingString, parcelCustomizeBindingLine } from '@/lib/parcel-customize';

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ height: string; txIndex: string }> }
) {
  try {
    const { height, txIndex } = await params;
    const h = parseInt(height, 10);
    const tx = parseInt(txIndex, 10);
    if (isNaN(h) || isNaN(tx) || h < 0 || tx < 0) return error('Invalid parameters', 400);

    const body = await req.json();
    const { walletAddress, signature, message, customColor, pattern, imageUrl, rotation, facing, emissive } = body;

    if (!walletAddress || !signature || !message) {
      return error('walletAddress, signature, and message are required', 400);
    }

    // TYPE GUARD: the string-valued fields must be string | null | undefined. A
    // non-string (number, boolean, object) would throw inside sanitizeString and
    // surface as a 500; reject it as a clean 400 before any signature work.
    for (const [field, value] of Object.entries({ customColor, pattern, imageUrl })) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return error(`${field} must be a string, null, or omitted`, 400);
      }
    }

    /* BIP-322 wallet signature verification (over the full signed message) */
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // PAYLOAD BINDING (OPEN-3): the signed message must commit to a hash of the
    // exact customization fields, so a captured signature cannot be re-applied
    // with different values. Hash the fields AS RECEIVED (pre-sanitization) so
    // client + server agree on the digest.
    const bindingHash = crypto
      .createHash('sha256')
      .update(parcelCustomizeBindingString(h, tx, { customColor, pattern, imageUrl, rotation, facing, emissive }))
      .digest('hex');
    if (!message.includes(parcelCustomizeBindingLine(bindingHash, h, tx))) {
      return error('Customization payload does not match the signed message', 400);
    }

    // ANTI-REPLAY (OPEN-3): require a server-issued, single-use challenge bound
    // to purpose 'parcel-customize'. Consuming it atomically closes replay of a
    // captured (signature, message) pair — the nonce works exactly once.
    if (!(await consumeChallengeFromMessage(walletAddress, message, { purpose: 'parcel-customize' }))) {
      return error('Invalid, expired, or already-used challenge — request one from /api/v1/challenge (purpose "parcel-customize")', 401);
    }

    // OWNERSHIP SCOPING: a parcel is a subdivision of a block. The on-chain BLOCK
    // owner may customize any parcel on it; a wallet that already owns THIS parcel
    // may re-customize it; a wallet with an active delegation may customize an
    // EXISTING parcel. Initializing (claiming) a not-yet-existing parcel is
    // restricted to the block owner. This closes a first-writer takeover where the
    // old create path trusted whoever signed first as the parcel owner, with no
    // on-chain check at all.
    const parcel = await prisma.parcel.findUnique({
      where: { blockHeight_txIndex: { blockHeight: h, txIndex: tx } },
    });

    const [block, user, delegation] = await Promise.all([
      prisma.block.findUnique({ where: { height: h }, select: { ownerAddress: true } }),
      prisma.user.findUnique({ where: { walletAddress }, select: { verified: true, anchorBlock: true, ownedBlocks: true } }),
      prisma.delegation.findFirst({
        where: { blockHeight: h, delegateeAddress: walletAddress, active: true, endDate: { gte: new Date() } },
      }),
    ]);
    const ownsBlock =
      block?.ownerAddress === walletAddress ||
      (user?.verified === true && (user.anchorBlock === h || user.ownedBlocks.includes(h)));
    const isParcelOwner = !!parcel && parcel.ownerAddress === walletAddress;

    if (parcel) {
      if (!isParcelOwner && !ownsBlock && !delegation) {
        return error('Not authorized to customize this parcel', 403);
      }
    } else if (!ownsBlock) {
      // Delegation lets you customize existing parcels, not claim new ownership.
      return error('Only the block owner can initialize a parcel — verified block ownership required', 403);
    }

    const updated = await prisma.parcel.upsert({
      where: { blockHeight_txIndex: { blockHeight: h, txIndex: tx } },
      update: {
        // undefined → leave unchanged; null → clear; string → sanitize.
        ...(customColor !== undefined && { customColor: customColor === null ? null : sanitizeString(customColor, 7) }),
        ...(pattern !== undefined && { pattern: pattern === null ? null : sanitizeString(pattern, 50) }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl === null ? null : sanitizeString(imageUrl, 500) }),
        ...(rotation !== undefined && { rotation: Math.max(0, Math.min(360, Number(rotation) || 0)) }),
        ...(facing !== undefined && { facing: ['north', 'south', 'east', 'west'].includes(facing) ? facing : 'north' }),
        ...(emissive !== undefined && { emissive: Boolean(emissive) }),
      },
      create: {
        blockHeight: h,
        txIndex: tx,
        ownerAddress: walletAddress,
        customColor: customColor ? sanitizeString(customColor, 7) : undefined,
        pattern: pattern ? sanitizeString(pattern, 50) : undefined,
        imageUrl: imageUrl ? sanitizeString(imageUrl, 500) : undefined,
        rotation: rotation ? Math.max(0, Math.min(360, Number(rotation) || 0)) : 0,
        facing: facing && ['north', 'south', 'east', 'west'].includes(facing) ? facing : 'north',
        emissive: emissive ? Boolean(emissive) : false,
      },
    });

    return success(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
