import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { enforceRateLimit, WORLD_WRITE_LIMIT } from '@/lib/api-rate-limit';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { gateDenialResponse } from '@/lib/ownership-gate';
import { TERRAIN_WRITABLE_FIELDS } from '@/lib/world-terrain-fields';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-terrain' });
  if (rl.response) return rl.response;

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
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-write', limit: WORLD_WRITE_LIMIT });
  if (rl.response) return rl.response;

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

    // ACTION BINDING: signature must authorize THIS terrain write on THIS block.
    const binding = verifyActionBinding(message, {
      action: 'world.terrain',
      method: 'POST',
      path: '/api/v1/world/terrain',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    // LIVE OWNERSHIP: same question the object routes ask, against the chain
    // rather than the `Block.ownerAddress` cache, and before the nonce is burned.
    const owns = await requireSignedBlockOwner(ownerAddress, blockHeight);
    if (!owns.ok) return gateDenialResponse(owns);

    // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    // H-03: Allowlist terrain fields to prevent mass assignment
    const safeSettings: Record<string, unknown> = {};
    for (const field of TERRAIN_WRITABLE_FIELDS) {
      if (body[field] !== undefined) safeSettings[field] = body[field];
    }

    const terrain = await prisma.blockTerrain.upsert({
      where: { blockHeight },
      create: { blockHeight, ownerAddress, ...safeSettings },
      update: safeSettings,
    });

    return NextResponse.json({ terrain }, { headers: rl.headers });
  } catch (err) {
    console.error('[Terrain POST]', err);
    return NextResponse.json({ error: 'Failed to update terrain' }, { status: 500 });
  }
}
