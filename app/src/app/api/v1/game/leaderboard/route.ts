import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-game-leaderboard' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    const category = req.nextUrl.searchParams.get('category') || 'score';
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '20'));

    if (!blockHeight) return NextResponse.json({ error: 'blockHeight required' }, { status: 400 });

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
