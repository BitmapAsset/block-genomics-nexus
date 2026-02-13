import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(_req: NextRequest) {
  try {
    const users = await prisma.user.findMany({
      where: { verified: true },
      orderBy: { createdAt: 'desc' },
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
    });

    return success(users);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
