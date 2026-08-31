import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-game-leaderboard' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    const category = req.nextUrl.searchParams.get('category') || 'score';
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '20'));

    if (blockHeight === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

    const entries = await prisma.gameLeaderboard.findMany({
      where: { blockHeight, category },
      orderBy: { value: 'desc' },
      take: limit,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    console.error('[Leaderboard GET]', err);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
