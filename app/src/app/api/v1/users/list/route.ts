import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { countVerifiedAgents } from '@/lib/directory-counts';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const [users, blockProfiles, total] = await Promise.all([
      prisma.user.findMany({
        where: { verified: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          handle: true,
          displayName: true,
          bio: true,
          tier: true,
          anchorBlock: true,
          genomeHash: true,
          walletAddress: true,
          createdAt: true,
          avatar: true,
        },
      }),
      prisma.blockProfile.findMany({
        where: { verified: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          handle: true,
          displayName: true,
          bio: true,
          tier: true,
          blockHeight: true,
          genomeHash: true,
          walletAddress: true,
          createdAt: true,
          avatar: true,
        },
      }),
      // Shared source of truth — identical filtering to /api/v1/stats.
      countVerifiedAgents(),
    ]);

    // Map block profiles to same shape as users for directory compatibility
    const profilesAsList = blockProfiles.map((p) => ({
      ...p,
      anchorBlock: p.blockHeight,
      isBlockProfile: true,
    }));

    return success({ users: [...users, ...profilesAsList], total, limit, offset });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
