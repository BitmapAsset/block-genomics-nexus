import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, name, blockHeight, parcelIndices, glowColor } = body;

    if (!walletAddress || !signature || !message) return error('Auth required', 400);
    if (!name || !blockHeight || !Array.isArray(parcelIndices) || parcelIndices.length === 0) {
      return error('name, blockHeight, and parcelIndices[] required', 400);
    }

    /* BIP-322 wallet signature verification */
    if (!verifyWalletSignature(walletAddress, message, signature)) return error('Invalid signature', 401);

    // Verify ownership of block
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== walletAddress) return error('Not the block owner', 403);

    // Validate parcel indices are numbers
    const indices = parcelIndices.filter((i: any) => typeof i === 'number' && i >= 0);
    if (indices.length === 0) return error('Invalid parcelIndices', 400);

    const estate = await prisma.estate.create({
      data: {
        name: sanitizeString(name, 100),
        ownerAddress: walletAddress,
        blockHeight,
        parcelIndices: JSON.stringify(indices),
        glowColor: glowColor ? sanitizeString(glowColor, 7) : null,
      },
    });

    return success({ ...estate, parcelIndices: indices }, 201);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
