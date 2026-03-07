import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Find blocks with active game elements
    const gameBlocks = await prisma.gameElement.groupBy({
      by: ['blockHeight'],
      _count: { id: true },
    });

    if (gameBlocks.length === 0) {
      return NextResponse.json({ games: [], count: 0 });
    }

    // Get block info + owner handles
    const heights = gameBlocks.map(g => g.blockHeight);
    const blocks = await prisma.block.findMany({
      where: { height: { in: heights } },
      select: { height: true, label: true, owner: { select: { handle: true } } },
    });

    const blockMap = new Map(blocks.map(b => [b.height, b]));

    // Get active player counts from game states
    const gamePlayers = await prisma.gameState.groupBy({
      by: ['blockHeight'],
      where: { blockHeight: { in: heights } },
      _count: { id: true },
    });
    const playerMap = new Map(gamePlayers.map(g => [g.blockHeight, g._count.id]));

    const games = gameBlocks.map(g => {
      const block = blockMap.get(g.blockHeight);
      return {
        blockHeight: g.blockHeight,
        elementCount: g._count.id,
        playerCount: playerMap.get(g.blockHeight) || 0,
        ownerHandle: block?.owner?.handle || null,
        label: block?.label || null,
      };
    }).sort((a, b) => b.playerCount - a.playerCount);

    return NextResponse.json({ games, count: games.length });
  } catch {
    return NextResponse.json({ games: [], count: 0 });
  }
}
