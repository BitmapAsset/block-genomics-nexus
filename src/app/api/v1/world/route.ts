import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    if (!blockHeight) return NextResponse.json({ error: 'blockHeight required' }, { status: 400 });

    const [objects, terrain] = await Promise.all([
      prisma.blockObject.findMany({ where: { blockHeight, visible: true }, orderBy: { createdAt: 'asc' } }),
      prisma.blockTerrain.findUnique({ where: { blockHeight } }),
    ]);

    return NextResponse.json({ objects, terrain });
  } catch (err) {
    console.error('[World GET]', err);
    return NextResponse.json({ error: 'Failed to fetch world data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, objectType, ...rest } = body;

    if (!blockHeight || !ownerAddress || !objectType) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, objectType required' }, { status: 400 });
    }

    // Verify ownership
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    const object = await prisma.blockObject.create({
      data: { blockHeight, ownerAddress, objectType, ...rest },
    });

    return NextResponse.json({ object }, { status: 201 });
  } catch (err) {
    console.error('[World POST]', err);
    return NextResponse.json({ error: 'Failed to create object' }, { status: 500 });
  }
}
