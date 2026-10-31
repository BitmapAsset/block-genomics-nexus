import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, blockHeight, signature, message } = body;

    if (!walletAddress || blockHeight === undefined) {
      return error('walletAddress and blockHeight are required', 400);
    }

    // The canonical 'profile.primary' message for this block and body, with a
    // one-time 'profile' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'profile.primary', method: 'PATCH', path: '/api/v1/profiles/set-primary',
      blockHeight: Number(blockHeight), purpose: 'profile',
    });
    if (!auth.ok) return error(auth.error, auth.status);

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
