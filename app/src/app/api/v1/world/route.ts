import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { emitAgentEvent } from '@/lib/agent-events';

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
    const { blockHeight, ownerAddress, objectType, signature, message, ...rest } = body;

    if (!blockHeight || !ownerAddress || !objectType) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, objectType required' }, { status: 400 });
    }

    // Verify wallet signature
    if (!signature || !message) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ACTION BINDING: the signature must authorize THIS exact request (method,
    // path, block, body) — not just be a fresh nonce that could be replayed at
    // another endpoint.
    const binding = verifyActionBinding(message, {
      action: 'world.create',
      method: 'POST',
      path: '/api/v1/world',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    // REPLAY PROTECTION: atomically consume the exact one-time nonce the signed
    // binding carried (not any nonce that happens to appear in the message) so a
    // captured signed mutation cannot be resubmitted.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    // Verify ownership
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible', 'locked'];
    const safeData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) safeData[field] = body[field];
    }

    const object = await prisma.blockObject.create({
      data: { blockHeight, ownerAddress, objectType, ...safeData },
    });

    // Fire-and-forget: notify BitmapAgents on this block of the world write.
    void emitAgentEvent(blockHeight, 'world_updated', {
      actor: ownerAddress,
      op: 'create',
      objectId: object.id,
      objectType,
      summary: `Owner placed a ${objectType} on block #${blockHeight}`,
    });

    return NextResponse.json({ object }, { status: 201 });
  } catch (err) {
    console.error('[World POST]', err);
    return NextResponse.json({ error: 'Failed to create object' }, { status: 500 });
  }
}
