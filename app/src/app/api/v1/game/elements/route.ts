import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-game-elements' });
  if (rl.response) return rl.response;

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

    // OWNERSHIP: placing an element is building on the block, so the deed
    // decides. Asked of the chain, never of `Block.ownerAddress` — that is a
    // cache a background sync refreshes, so inside the sale→sync window it
    // still named the seller. `blockHeight` is safe to take from the body
    // because the signed action binding above committed to it.
    //
    // Asked BEFORE the nonce is consumed, so an indexer outage does not cost
    // the caller a fresh wallet signature for a request that never applied.
    const gate = await requireLiveBlockOwner(ownerAddress, blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // Tier is a product entitlement layered on top of the deed, not a substitute
    // for it. The old form only asked tier 1 about the land, so a tier-2 wallet
    // reached the create with no ownership check of any kind.
    const user = await prisma.user.findUnique({ where: { walletAddress: ownerAddress } });
    if (!user || user.tier > 2) {
      return NextResponse.json({ error: 'Tier 1 or 2 required to create game elements' }, { status: 403 });
    }

    // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
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
