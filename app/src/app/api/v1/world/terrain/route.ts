import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';

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
    const { blockHeight, ownerAddress, signature, message, ...settings } = body;

    if (!blockHeight || !ownerAddress) {
      return NextResponse.json({ error: 'blockHeight and ownerAddress required' }, { status: 400 });
    }

    // Verify wallet signature
    if (!signature || !message) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    // H-03: Allowlist terrain fields to prevent mass assignment
    const allowedFields = ['groundColor', 'fogEnabled', 'fogColor', 'skyColor', 'weather', 'surfaceType'];
    const safeSettings: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) safeSettings[field] = body[field];
    }

    const terrain = await prisma.blockTerrain.upsert({
      where: { blockHeight },
      create: { blockHeight, ownerAddress, ...safeSettings },
      update: safeSettings,
    });

    return NextResponse.json({ terrain });
  } catch (err) {
    console.error('[Terrain POST]', err);
    return NextResponse.json({ error: 'Failed to update terrain' }, { status: 500 });
  }
}
