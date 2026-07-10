import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';

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

    /* BIP-322 wallet signature verification */
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
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
        ...(customColor !== undefined && { customColor: sanitizeString(customColor, 7) }),
        ...(pattern !== undefined && { pattern: sanitizeString(pattern, 50) }),
        ...(imageUrl !== undefined && { imageUrl: sanitizeString(imageUrl, 500) }),
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
