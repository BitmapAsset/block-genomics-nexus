/**
 * A guardian stands on a block, so the block's deed decides who may administer
 * it — not the `ownerAddress` stored on the guardian row.
 *
 * That column is the seller's address and stays the seller's address: a release
 * during `processOwnershipTransfer` wipes the guardian's CONTENTS but never
 * re-attributes the row. Reading it as permission therefore did not merely lag a
 * sale, it outlived one — the buyer was refused on land they had just bought,
 * and the seller could re-arm the released shell with a fresh soul and LLM key
 * on someone else's block. Authorship is provenance; the deed is authority.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encryptApiKey, maskApiKey } from '@/lib/key-encryption';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';
import { emitGuardianTransition } from '@/lib/block-event-emitters';
import { guardianLiveState } from '@/lib/block-events';
import { verifySignedAction, signedActionHelp } from '@/lib/signed-action';

function sanitizeGuardian(g: Record<string, unknown>) {
  return { ...g, llmApiKey: maskApiKey(g.llmApiKey as string) };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-guardian-id' });
  if (rl.response) return rl.response;

  try {
    const { id } = await params;
    const row = await prisma.guardianAgent.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    return NextResponse.json({ guardian: sanitizeGuardian(row as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian GET/:id]', err);
    return NextResponse.json({ error: 'Failed to fetch guardian' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Auth: the signer signs the canonical message for exactly this edit (this
    // guardian's path and block, this body) with a one-time 'guardian' nonce.
    const { ownerAddress, signature, message } = body;
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'Authentication required (ownerAddress, signature, message)' }, { status: 401 });
    }
    const existing = await prisma.guardianAgent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    // The height comes from the stored guardian, never the request body, so a
    // caller cannot gate against a block they own while editing an agent on one
    // they do not.
    const auth = await verifySignedAction(ownerAddress, message, signature, body, {
      action: 'guardian.update', method: 'PATCH', path: `/api/v1/guardian/${id}`,
      blockHeight: existing.blockHeight, purpose: 'guardian',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const gate = await requireLiveBlockOwner(ownerAddress, existing.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // Build update data from allowed fields
    const allowed = [
      'name', 'soulMd', 'agentMd', 'skillsMd', 'memoryMd', 'personality',
      'llmProvider', 'llmModel', 'llmEndpoint', 'selfHosted', 'agentEndpoint',
      'autoResponses', 'escalateTelegram', 'escalateEmail', 'autoApproveDelegationUnder',
      'status',
    ];

    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        data[key] = key === 'autoResponses' ? JSON.stringify(body[key]) : body[key];
      }
    }

    // Handle API key separately (encrypt).
    //
    // SECURITY (bg48 Q-14 / Q-01c): the stored key is decrypted and sent, as a
    // bearer token, to wherever `llmEndpoint` / `agentEndpoint` points. A block
    // can change hands while the guardian row — and the seller's encrypted key —
    // survives the release, and the PATCH gate authorizes the LIVE owner. So the
    // new owner could repoint the endpoint at a server they control and, on the
    // next chat, receive the previous owner's decrypted key. Breaking the link:
    // if the destination (endpoint/provider/host mode) changes and the caller
    // does NOT supply a fresh key, clear the stored key. The key must be
    // re-entered to go anywhere new; an inherited key can never be redirected.
    const destinationChanged =
      (body.llmEndpoint !== undefined && body.llmEndpoint !== existing.llmEndpoint) ||
      (body.llmProvider !== undefined && body.llmProvider !== existing.llmProvider) ||
      (body.agentEndpoint !== undefined && body.agentEndpoint !== existing.agentEndpoint) ||
      (body.selfHosted !== undefined && body.selfHosted !== existing.selfHosted);
    if (body.llmApiKey) {
      data.llmApiKey = encryptApiKey(body.llmApiKey);
    } else if (destinationChanged && existing.llmApiKey) {
      data.llmApiKey = null;
    }

    // The state is read before the write, so nothing the write does to
    // `existing` can make before and after look the same.
    const before = guardianLiveState(existing);
    const updated = await prisma.guardianAgent.update({ where: { id }, data });
    // `guardian.status` only if this edit moved it between idle/resting/offline.
    await emitGuardianTransition(before, updated);
    return NextResponse.json({ guardian: sanitizeGuardian(updated as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian PATCH]', err);
    return NextResponse.json({ error: 'Failed to update guardian' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // JSON body { ownerAddress, message, signature }; the signed body is { ownerAddress }.
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const { ownerAddress, signature, message } = body ?? {};
    if (!body || !ownerAddress || !signature || !message) {
      return NextResponse.json({ error: `Authentication required (ownerAddress, signature, message in a JSON body). ${signedActionHelp({ action: 'guardian.delete', purpose: 'guardian' })}` }, { status: 401 });
    }
    const target = await prisma.guardianAgent.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    const auth = await verifySignedAction(ownerAddress, message, signature, body, {
      action: 'guardian.delete', method: 'DELETE', path: `/api/v1/guardian/${id}`,
      blockHeight: target.blockHeight, purpose: 'guardian',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const gate = await requireLiveBlockOwner(ownerAddress as string, target.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);
    const before = guardianLiveState(target);
    await prisma.guardianAgent.update({ where: { id }, data: { status: 'stopped' } });
    await emitGuardianTransition(before, { ...target, status: 'stopped' });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[Guardian DELETE]', err);
    return NextResponse.json({ error: 'Failed to deactivate guardian' }, { status: 500 });
  }
}
