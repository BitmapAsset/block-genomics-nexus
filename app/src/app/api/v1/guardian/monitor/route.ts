/**
 * A monitor token is a live read channel onto a block's guardian traffic, so it
 * is issued and revoked on the block's deed — not on the `ownerAddress` stored
 * on the guardian row, which keeps naming the seller after a sale.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';
import { generateMonitorToken, revokeMonitorToken } from '@/lib/monitor-tokens';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { guardianId, ownerAddress, signature, message } = body;

    if (!guardianId || !ownerAddress || !signature || !message) {
      return error('Missing required fields: guardianId, ownerAddress, signature, message');
    }

    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
    });

    if (!guardian) return error('Guardian not found', 404);
    // Bound to this guardian (body) and its block, used once.
    const auth = await verifySignedAction(ownerAddress, message, signature, body, {
      action: 'guardian.monitor.mint', method: 'POST', path: '/api/v1/guardian/monitor',
      blockHeight: guardian.blockHeight, purpose: 'guardian',
    });
    if (!auth.ok) return error(auth.error, auth.status);
    const gate = await requireLiveBlockOwner(ownerAddress, guardian.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    const token = await generateMonitorToken(guardianId, ownerAddress);

    return success({ token, guardianId, expiresAt: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { guardianId, ownerAddress, signature, message } = body;

    if (!guardianId || !ownerAddress || !signature || !message) {
      return error('Missing required fields: guardianId, ownerAddress, signature, message');
    }

    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
    });

    if (!guardian) return error('Guardian not found', 404);
    // Bound to this guardian (body) and its block, used once.
    const auth = await verifySignedAction(ownerAddress, message, signature, body, {
      action: 'guardian.monitor.revoke', method: 'DELETE', path: '/api/v1/guardian/monitor',
      blockHeight: guardian.blockHeight, purpose: 'guardian',
    });
    if (!auth.ok) return error(auth.error, auth.status);
    const gate = await requireLiveBlockOwner(ownerAddress, guardian.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    await revokeMonitorToken(guardianId);

    return success({ revoked: true, guardianId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
