import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, blockHeight } = body;

    if (!walletAddress || blockHeight === undefined) {
      return error('walletAddress and blockHeight are required', 400);
    }

    // Verify the profile exists and belongs to this wallet
    const profile = await prisma.blockProfile.findUnique({
      where: { walletAddress_blockHeight: { walletAddress, blockHeight } },
    });

    if (!profile) {
      return error('Profile not found', 404);
    }

    // Set all profiles for this wallet to non-primary, then set the target as primary
    await prisma.$transaction([
      prisma.blockProfile.updateMany({
        where: { walletAddress },
        data: { isPrimary: false },
      }),
      prisma.blockProfile.update({
        where: { walletAddress_blockHeight: { walletAddress, blockHeight } },
        data: { isPrimary: true },
      }),
    ]);

    return success({ walletAddress, blockHeight, isPrimary: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
