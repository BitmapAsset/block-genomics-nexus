import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { countVerifiedAgents } from '@/lib/directory-counts';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-users-list' });
  if (rl.response) return rl.response;

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
          resolvedTier: true,
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
          owner: { select: { resolvedTier: true } },
        },
      }),
      // Shared source of truth — identical filtering to /api/v1/stats.
      countVerifiedAgents(),
    ]);

    // Map block profiles to same shape as users for directory compatibility
    const profilesAsList = blockProfiles.map(({ owner, ...p }) => ({
      ...p,
      resolvedTier: owner?.resolvedTier ?? 0,
      anchorBlock: p.blockHeight,
      isBlockProfile: true,
    }));

    return success({ users: [...users, ...profilesAsList], total, limit, offset });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
