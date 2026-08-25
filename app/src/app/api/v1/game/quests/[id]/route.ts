/**
 * A quest belongs to the block it is on, so the block's deed decides who may
 * edit it — not the `ownerAddress` stored on the quest, which records who wrote
 * it and never moves when the land does.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
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

    const quest = await prisma.gameQuest.findUnique({ where: { id } });
    if (!quest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const gate = await requireLiveBlockOwner(ownerAddress, quest.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['name', 'description', 'steps', 'rewardXp', 'rewardCoins', 'difficulty', 'config', 'enabled'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (updates.steps && typeof updates.steps !== 'string') updates.steps = JSON.stringify(updates.steps);

    const updated = await prisma.gameQuest.update({ where: { id }, data: updates });
    return NextResponse.json({ quest: updated });
  } catch (err) {
    console.error('[Quest PATCH]', err);
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

    const quest = await prisma.gameQuest.findUnique({ where: { id } });
    if (!quest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const gate = await requireLiveBlockOwner(ownerAddress, quest.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    await prisma.gameQuest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Quest DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
