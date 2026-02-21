import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    const [user, blocksFromBlock, blocksFromProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { walletAddress: address },
        include: { blockProfiles: true },
      }),
      prisma.block.findMany({
        where: { ownerAddress: address },
        select: { height: true },
      }),
      prisma.blockProfile.findMany({
        where: { walletAddress: address },
        select: { blockHeight: true },
      }),
    ]);

    if (!user) return error('User not found', 404);

    const ownedBlocks = [
      ...new Set([
        ...(user.ownedBlocks || []),
        ...blocksFromBlock.map((b) => b.height),
        ...blocksFromProfile.map((bp) => bp.blockHeight),
      ]),
    ];

    logActivity(address, 'login', { method: 'wallet_lookup' });

    return success({
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      genomeHash: user.genomeHash,
      anchorBlock: user.anchorBlock,
      tier: user.tier,
      verified: user.verified,
      blockProfiles: user.blockProfiles,
      ownedBlocks,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
