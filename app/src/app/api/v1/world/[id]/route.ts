import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { requireVerifiedBlock, gateDenialResponse, sessionTokenFromHeaders } from '@/lib/ownership-gate';
import { looksLikeSessionToken } from '@/lib/verified-sessions';

// H-03: Allowlist of fields that can be updated on block objects
const ALLOWED_UPDATE_FIELDS = ['objectType', 'geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible', 'locked'];

function pickAllowed(body: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) safe[field] = body[field];
  }
  return safe;
}

type BlockObject = { id: string; blockHeight: number; ownerAddress: string; locked: boolean };

/**
 * Resolve who is authorized to mutate `existing`, by either credential path.
 *
 *   AGENT  — `Authorization: Bearer bg_vfy_…`. The ownership gate checks the
 *            session is live, the object's block is in its proven scope, and the
 *            wallet STILL holds the inscription on-chain right now, so a
 *            transferred bitmap fails closed mid-session.
 *   WALLET — an action-bound BIP-322 signature, the browser path, unchanged.
 *
 * The block height always comes from the stored object, never from the request
 * body — otherwise a caller could gate against a block it owns while mutating an
 * object on one it does not.
 */
async function resolveActor(
  req: NextRequest,
  existing: BlockObject,
  body: Record<string, unknown>,
  action: 'world.update' | 'world.delete',
  method: 'PATCH' | 'DELETE',
): Promise<{ ownerAddress: string } | { response: NextResponse }> {
  if (looksLikeSessionToken(sessionTokenFromHeaders(req.headers))) {
    const gate = await requireVerifiedBlock(req, existing.blockHeight);
    if (!gate.ok) return { response: gateDenialResponse(gate) };
    return { ownerAddress: gate.walletAddress! };
  }

  const ownerAddress = typeof body.ownerAddress === 'string' ? body.ownerAddress : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';
  const message = typeof body.message === 'string' ? body.message : '';

  // No credential of either kind. Answer the question the caller actually has —
  // "how do I become allowed to do this?" — rather than a 400 about a missing
  // body field, which reads as a malformed request instead of a refusal.
  if (!signature || !message) {
    return {
      response: gateDenialResponse({
        ok: false,
        status: 401,
        code: 'unverified',
        reason:
          'Modifying an object requires proof that you own its block. Verify with a bg_vfy_ session token, ' +
          'or send an action-bound BIP-322 signature.',
      }),
    };
  }
  if (!ownerAddress) {
    return { response: NextResponse.json({ error: 'ownerAddress required' }, { status: 400 }) };
  }
  if (!verifyWalletSignature(ownerAddress, message, signature)) {
    return { response: NextResponse.json({ error: 'Invalid signature' }, { status: 401 }) };
  }

  // ACTION BINDING: signature must authorize THIS object on THIS block.
  const binding = verifyActionBinding(message, {
    action,
    method,
    path: `/api/v1/world/${existing.id}`,
    blockHeight: existing.blockHeight,
    bodyHash: await hashBody(body),
  });
  if (!binding.ok) {
    return { response: NextResponse.json({ error: binding.reason }, { status: 401 }) };
  }

  // REPLAY PROTECTION: consume the exact one-time nonce the signed binding carried.
  if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
    return {
      response: NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 }),
    };
  }

  return { ownerAddress };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.blockObject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });

    const actor = await resolveActor(req, existing, body, 'world.update', 'PATCH');
    if ('response' in actor) return actor.response;

    if (existing.ownerAddress !== actor.ownerAddress) return NextResponse.json({ error: 'Not owner' }, { status: 403 });
    if (existing.locked) return NextResponse.json({ error: 'Object is locked' }, { status: 403 });

    const updates = pickAllowed(body);
    const updated = await prisma.blockObject.update({ where: { id }, data: updates });
    return NextResponse.json({ object: updated });
  } catch (err) {
    console.error('[World PATCH]', err);
    return NextResponse.json({ error: 'Failed to update object' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.blockObject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });

    const actor = await resolveActor(req, existing, body, 'world.delete', 'DELETE');
    if ('response' in actor) return actor.response;

    if (existing.ownerAddress !== actor.ownerAddress) return NextResponse.json({ error: 'Not owner' }, { status: 403 });
    if (existing.locked) return NextResponse.json({ error: 'Object is locked' }, { status: 403 });

    await prisma.blockObject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[World DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete object' }, { status: 500 });
  }
}
