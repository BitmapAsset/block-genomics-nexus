import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MORAL_CODE } from '@/lib/protocol';

export async function GET() {
  try {
    const [totalFlags, totalHidden, totalRestored, totalActions, recentActions] = await Promise.all([
      prisma.contentFlag.count(),
      prisma.contentVerdict.count({ where: { status: { in: ['hidden', 'permanent_hide'] } } }),
      prisma.contentVerdict.count({ where: { status: 'restored' } }),
      prisma.brainAction.count(),
      prisma.brainAction.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalFlags,
        totalHidden,
        totalRestored,
        totalActions,
        communityOverrideRate: totalHidden > 0 ? ((totalRestored / (totalHidden + totalRestored)) * 100).toFixed(1) + '%' : '0%',
        moralCode: MORAL_CODE,
        recentActions,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
