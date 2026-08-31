import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-game-quests' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    if (blockHeight === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

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
    const { blockHeight, ownerAddress, name, steps, signature, message } = body;

    if (!blockHeight || !ownerAddress || !name || !steps) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, name, steps required' }, { status: 400 });
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: ownerAddress } });
    if (!user || user.tier > 2) {
      return NextResponse.json({ error: 'Tier 1 or 2 required to create quests' }, { status: 403 });
    }

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['description', 'rewardXp', 'rewardCoins', 'difficulty', 'config'];
    const safeData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) safeData[field] = body[field];
    }

    const quest = await prisma.gameQuest.create({
      data: { blockHeight, ownerAddress, name, steps: typeof steps === 'string' ? steps : JSON.stringify(steps), ...safeData },
    });

    return NextResponse.json({ quest }, { status: 201 });
  } catch (err) {
    console.error('[Quests POST]', err);
    return NextResponse.json({ error: 'Failed to create quest' }, { status: 500 });
  }
}
