import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    if (!blockHeight) return NextResponse.json({ error: 'blockHeight required' }, { status: 400 });

    const quests = await prisma.gameQuest.findMany({
      where: { blockHeight, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ quests });
  } catch (err) {
    console.error('[Quests GET]', err);
    return NextResponse.json({ error: 'Failed to fetch quests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, name, steps, ...rest } = body;

    if (!blockHeight || !ownerAddress || !name || !steps) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, name, steps required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: ownerAddress } });
    if (!user || user.tier > 2) {
      return NextResponse.json({ error: 'Tier 1 or 2 required to create quests' }, { status: 403 });
    }

    const quest = await prisma.gameQuest.create({
      data: { blockHeight, ownerAddress, name, steps: typeof steps === 'string' ? steps : JSON.stringify(steps), ...rest },
    });

    return NextResponse.json({ quest }, { status: 201 });
  } catch (err) {
    console.error('[Quests POST]', err);
    return NextResponse.json({ error: 'Failed to create quest' }, { status: 500 });
  }
}
