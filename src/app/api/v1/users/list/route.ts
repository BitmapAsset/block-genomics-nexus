import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const [users, userTotal, blockProfiles, profileTotal] = await Promise.all([
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
      prisma.user.count({ where: { verified: true } }),
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
      prisma.blockProfile.count({ where: { verified: true } }),
    ]);

    // Map block profiles to same shape as users for directory compatibility
    const profilesAsList = blockProfiles.map((p: any) => ({
      ...p,
      anchorBlock: p.blockHeight,
      isBlockProfile: true,
    }));

    return success({ users: [...users, ...profilesAsList], total: userTotal + profileTotal, limit, offset });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
