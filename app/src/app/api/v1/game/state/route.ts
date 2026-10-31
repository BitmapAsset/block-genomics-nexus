import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignedAction } from '@/lib/signed-action';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-game-state' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    const wallet = req.nextUrl.searchParams.get('wallet') || '';
    if (blockHeight === null || !wallet) return NextResponse.json({ error: 'A valid blockHeight and wallet are required' }, { status: 400 });

    let state = await prisma.gameState.findUnique({
      where: { blockHeight_walletAddress: { blockHeight, walletAddress: wallet } },
    });

    if (!state) {
      state = await prisma.gameState.create({
        data: { blockHeight, walletAddress: wallet },
      });
    }

    return NextResponse.json({ state });
  } catch (err) {
    console.error('[GameState GET]', err);
    return NextResponse.json({ error: 'Failed to fetch game state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, walletAddress, signature, message } = body;

    if (!blockHeight || !walletAddress) {
      return NextResponse.json({ error: 'blockHeight and walletAddress required' }, { status: 400 });
    }

    // Signed action message bound to this request, one-time 'game' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'game.state', method: 'POST', path: '/api/v1/game/state', blockHeight: Number(blockHeight), purpose: 'game',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Allowlist fields that can be updated (H-03: prevent mass assignment)
    const allowedFields = ['score', 'coins', 'xp', 'level', 'questsCompleted', 'elementsPlaced'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const state = await prisma.gameState.upsert({
      where: { blockHeight_walletAddress: { blockHeight, walletAddress } },
      update: { ...updates, lastVisit: new Date() },
      create: { blockHeight, walletAddress, ...updates },
    });

    return NextResponse.json({ state });
  } catch (err) {
    console.error('[GameState POST]', err);
    return NextResponse.json({ error: 'Failed to update game state' }, { status: 500 });
  }
}
