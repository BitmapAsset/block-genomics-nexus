/**
 * Liveness for a SELF-HOSTED guardian.
 *
 * Despite the machine-to-machine shape, this is a wallet-authenticated route,
 * not an agent-token one: the daemon presents the owner's address and a BIP-322
 * signature. (`/api/v1/agents/[agentId]/heartbeat` is the token-authenticated
 * one — a different model for a different object.) So the deed rule applies
 * here like anywhere else.
 *
 * It matters because a heartbeat is not a status ping: it sets
 * `endpointVerified`, which is what points visitors at `agentEndpoint`. Left on
 * the stored `ownerAddress`, a seller could keep serving the agent that speaks
 * for a block they no longer own.
 *
 * SECOND-ORDER EFFECT: this puts an indexer round-trip on a polling loop. The
 * auth tier never reads cache by design, so the cost is real — but bounded by
 * `ord.ts`, which self-throttles process-wide and coalesces concurrent lookups
 * for the same inscription into one query. An outage now answers 503, which the
 * daemon must treat as retry-later rather than as a reason to stop.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

export async function POST(req: NextRequest) {
  try {
    const { guardianId, ownerAddress, signature, message } = await req.json();

    if (!guardianId || !ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'guardianId, ownerAddress, signature, and message required' }, { status: 400 });
    }

    const guardian = await prisma.guardianAgent.findUnique({ where: { id: guardianId } });
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    if (!guardian.selfHosted) return NextResponse.json({ error: 'Heartbeat only for self-hosted guardians' }, { status: 400 });

    // Verify wallet signature
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const gate = await requireLiveBlockOwner(ownerAddress, guardian.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    await prisma.guardianAgent.update({
      where: { id: guardianId },
      data: { lastHeartbeat: new Date(), endpointVerified: true },
    });

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    console.error('[Guardian Heartbeat]', err);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
