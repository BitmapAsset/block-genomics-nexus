import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const [users, total] = await Promise.all([
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
          walletAddress: true, // needed for profile linking
          createdAt: true,
          avatar: true,
        },
      }),
      prisma.user.count({ where: { verified: true } }),
    ]);

    return success({ users, total, limit, offset });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
