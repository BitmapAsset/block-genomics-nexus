import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';

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
    const { blockHeight, ownerAddress, gameType, signature, message } = body;

    if (!blockHeight || !ownerAddress || !gameType) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, gameType required' }, { status: 400 });
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ACTION BINDING: signature must authorize THIS game-element write on THIS block.
    const binding = verifyActionBinding(message, {
      action: 'game.create',
      method: 'POST',
      path: '/api/v1/game/elements',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
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

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['name', 'description', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'color', 'geometry', 'material', 'config'];
    const safeData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) safeData[field] = body[field];
    }

    const element = await prisma.gameElement.create({
      data: { blockHeight, ownerAddress, gameType, ...safeData },
    });

    return NextResponse.json({ element }, { status: 201 });
  } catch (err) {
    console.error('[GameElements POST]', err);
    return NextResponse.json({ error: 'Failed to create game element' }, { status: 500 });
  }
}
