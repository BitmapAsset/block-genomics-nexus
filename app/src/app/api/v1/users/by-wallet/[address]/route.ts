import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-users-by-wallet-address' });
  if (rl.response) return rl.response;

  try {
    const { address } = await params;

    const [user, blocksFromBlock, blocksFromProfile] = await Promise.all([
      prisma.user.findFirst({
        where: {
          walletAddress: {
            equals: address,
            mode: 'insensitive',
          },
        },
        include: { blockProfiles: true },
      }),
      prisma.block.findMany({
        where: {
          ownerAddress: {
            equals: address,
            mode: 'insensitive',
          },
        },
        select: { height: true },
      }),
      prisma.blockProfile.findMany({
        where: {
          walletAddress: {
            equals: address,
            mode: 'insensitive',
          },
        },
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
      resolvedTier: user.resolvedTier ?? 0,
      verified: user.verified,
      blockProfiles: user.blockProfiles,
      ownedBlocks,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
