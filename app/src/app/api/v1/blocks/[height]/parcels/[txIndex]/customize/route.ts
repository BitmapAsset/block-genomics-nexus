import { NextRequest } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { parcelCustomizeBindingString, parcelCustomizeBindingLine } from '@/lib/parcel-customize';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ height: string; txIndex: string }> }
) {
  try {
    const { height, txIndex } = await params;
    const h = parseBlockHeight(height);
    const tx = parseInt(txIndex, 10);
    if (h === null || isNaN(tx) || tx < 0) return error('Invalid parameters', 400);

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

    const delegation = await prisma.delegation.findFirst({
      where: { blockHeight: h, delegateeAddress: walletAddress, active: true, endDate: { gte: new Date() } },
    });
    const isParcelOwner = !!parcel && parcel.ownerAddress === walletAddress;

    // Block ownership is asked of the chain, not of `Block.ownerAddress` plus the
    // verified-`User` snapshot. Both are caches a background sync refreshes, so
    // between an on-chain sale and the next run they still named the seller.
    //
    // Asked only where it can change the answer: an EXISTING parcel is already
    // customizable by its parcel owner or an active delegate, so paying an
    // indexer round-trip to re-confirm what those facts settle on their own would
    // put every delegate write at the mercy of indexer uptime for nothing.
    // Initializing a parcel is a claim on new land and always asks.
    if (!parcel || (!isParcelOwner && !delegation)) {
      const owns = await requireLiveBlockOwner(walletAddress, h);
      if (!owns.ok) {
        return error(
          owns.reason ??
            (parcel
              ? 'Not authorized to customize this parcel'
              : 'Only the block owner can initialize a parcel — live on-chain ownership required'),
          owns.status,
        );
      }
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
