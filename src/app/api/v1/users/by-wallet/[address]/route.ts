import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    const user = await prisma.user.findUnique({
      where: { walletAddress: address },
    });

    if (!user) return error('User not found', 404);

    return success({
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      genomeHash: user.genomeHash,
      anchorBlock: user.anchorBlock,
      tier: user.tier,
      verified: user.verified,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
