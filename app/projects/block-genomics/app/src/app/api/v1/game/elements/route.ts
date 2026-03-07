import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    if (!blockHeight) return NextResponse.json({ error: 'blockHeight required' }, { status: 400 });

    const elements = await prisma.gameElement.findMany({
      where: { blockHeight, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ elements });
  } catch (err) {
    console.error('[GameElements GET]', err);
    return NextResponse.json({ error: 'Failed to fetch game elements' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, gameType, ...rest } = body;

    if (!blockHeight || !ownerAddress || !gameType) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, gameType required' }, { status: 400 });
    }

    // Verify ownership (T1 block owner or T2 parcel owner)
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    const user = await prisma.user.findUnique({ where: { walletAddress: ownerAddress } });
    if (!user || user.tier > 2) {
      return NextResponse.json({ error: 'Tier 1 or 2 required to create game elements' }, { status: 403 });
    }
    if (user.tier === 1 && (!block || block.ownerAddress !== ownerAddress)) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    const element = await prisma.gameElement.create({
      data: { blockHeight, ownerAddress, gameType, ...rest },
    });

    return NextResponse.json({ element }, { status: 201 });
  } catch (err) {
    console.error('[GameElements POST]', err);
    return NextResponse.json({ error: 'Failed to create game element' }, { status: 500 });
  }
}
