import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    if (!blockHeight) return NextResponse.json({ error: 'blockHeight required' }, { status: 400 });

    const terrain = await prisma.blockTerrain.findUnique({ where: { blockHeight } });
    return NextResponse.json({ terrain });
  } catch (err) {
    console.error('[Terrain GET]', err);
    return NextResponse.json({ error: 'Failed to fetch terrain' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, ...settings } = body;

    if (!blockHeight || !ownerAddress) {
      return NextResponse.json({ error: 'blockHeight and ownerAddress required' }, { status: 400 });
    }

    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    const terrain = await prisma.blockTerrain.upsert({
      where: { blockHeight },
      create: { blockHeight, ownerAddress, ...settings },
      update: settings,
    });

    return NextResponse.json({ terrain });
  } catch (err) {
    console.error('[Terrain POST]', err);
    return NextResponse.json({ error: 'Failed to update terrain' }, { status: 500 });
  }
}
