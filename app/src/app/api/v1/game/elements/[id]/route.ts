/**
 * A game element stands on a block, so the block's deed decides who may mutate
 * it — not the `ownerAddress` stored on the element, which is provenance.
 *
 * The ownership check runs BEFORE the nonce is consumed, so an indexer outage
 * does not cost the caller a fresh wallet signature for a request that never
 * had a chance to apply.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, signature, message } = body;

    // SECURITY: Require wallet signature verification
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'ownerAddress, signature, and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const element = await prisma.gameElement.findUnique({ where: { id } });
    if (!element) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const gate = await requireLiveBlockOwner(ownerAddress, element.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // ACTION BINDING: signature must authorize THIS element on THIS block.
    const binding = verifyActionBinding(message, {
      action: 'game.update',
      method: 'PATCH',
      path: `/api/v1/game/elements/${id}`,
      blockHeight: element.blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['name', 'description', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'color', 'geometry', 'material', 'config', 'enabled'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const updated = await prisma.gameElement.update({ where: { id }, data: updates });
    return NextResponse.json({ element: updated });
  } catch (err) {
    console.error('[GameElement PATCH]', err);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, signature, message } = body;

    // SECURITY: Require wallet signature verification
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'ownerAddress, signature, and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const element = await prisma.gameElement.findUnique({ where: { id } });
    if (!element) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const gate = await requireLiveBlockOwner(ownerAddress, element.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // ACTION BINDING: signature must authorize THIS element on THIS block.
    const binding = verifyActionBinding(message, {
      action: 'game.delete',
      method: 'DELETE',
      path: `/api/v1/game/elements/${id}`,
      blockHeight: element.blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    await prisma.gameElement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[GameElement DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
