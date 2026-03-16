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

    // Verify ownership or delegation
    const parcel = await prisma.parcel.findUnique({
      where: { blockHeight_txIndex: { blockHeight: h, txIndex: tx } },
    });

    if (parcel && parcel.ownerAddress !== walletAddress) {
      // Check for active delegation
      const delegation = await prisma.delegation.findFirst({
        where: { blockHeight: h, delegateeAddress: walletAddress, active: true, endDate: { gte: new Date() } },
      });
      if (!delegation) return error('Not authorized to customize this parcel', 403);
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
