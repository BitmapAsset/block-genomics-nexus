import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

/** Public read of the elements placed on a block's world (MCP `bg_world_elements`). */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-elements' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    if (blockHeight === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

    const elements = await prisma.gameElement.findMany({
      where: { blockHeight, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ elements });
  } catch (err) {
    console.error('[Elements GET]', err);
    return NextResponse.json({ error: 'Failed to fetch elements' }, { status: 500 });
  }
}
