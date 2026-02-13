import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;

    const user = await prisma.user.findUnique({
      where: { handle },
      include: {
        _count: { select: { blocks: true, parcels: true, estates: true } },
      },
    });

    if (!user) return error('User not found', 404);

    return success({
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      genomeHash: user.genomeHash,
      anchorBlock: user.anchorBlock,
      tier: user.tier,
      verified: user.verified,
      createdAt: user.createdAt,
      blockCount: user._count.blocks,
      parcelCount: user._count.parcels,
      estateCount: user._count.estates,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
