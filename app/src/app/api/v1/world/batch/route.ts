import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { emitAgentEvent } from '@/lib/agent-events';
import { requireSignedBlockOwner, authorizeObjectWrite } from '@/lib/block-write-auth';
import { gateDenialResponse } from '@/lib/ownership-gate';
import { enforceRateLimit, WORLD_BATCH_LIMIT } from '@/lib/api-rate-limit';

// H-03: Allowlist of fields for block objects
const ALLOWED_OBJECT_FIELDS = ['objectType', 'geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible'];

function pickAllowed(data: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of ALLOWED_OBJECT_FIELDS) {
    if (data[field] !== undefined) safe[field] = data[field];
  }
  return safe;
}

interface BatchOp {
  action: 'create' | 'update' | 'delete';
  id?: string;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  // §10: one batch is up to 100 sub-ops, so it gets a tighter ceiling than the
  // single-object write routes.
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-batch', limit: WORLD_BATCH_LIMIT });
  if (rl.response) return rl.response;

  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, operations, signature, message } = body as {
      blockHeight: number; ownerAddress: string; operations: BatchOp[];
      signature?: string; message?: string;
    };

    if (!blockHeight || !ownerAddress || !operations?.length) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, operations required' }, { status: 400 });
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ACTION BINDING: signature must authorize THIS batch (incl. operations) on THIS block.
    const binding = verifyActionBinding(message, {
      action: 'world.batch',
      method: 'POST',
      path: '/api/v1/world/batch',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason }, { status: 401 });
    }

    if (operations.length > 100) {
      return NextResponse.json({ error: 'Max 100 operations per batch' }, { status: 400 });
    }

    // OWNERSHIP + RESOURCE VALIDATION BEFORE NONCE BURN: like the single PATCH/DELETE
    // routes, every sub-op's ownership and resource existence is validated up front.
    // A forged or unauthorized sub-op rejects the whole batch with the nonce
    // preserved, so an attacker cannot burn a victim's valid nonce on a bad batch.
    //
    // The ownership question is asked once, against the chain rather than the
    // `Block.ownerAddress` cache, and it covers every sub-op: holding the block
    // is what authorizes touching the things on it.
    const owns = await requireSignedBlockOwner(ownerAddress, blockHeight);
    if (!owns.ok) return gateDenialResponse(owns);

    // Batch-fetch all existing objects that will be updated/deleted (eliminates N+1)
    const idsToCheck = operations
      .filter(op => (op.action === 'update' || op.action === 'delete') && op.id)
      .map(op => op.id!);

    // `blockHeight` is selected and `ownerAddress` is not: the sub-op check is
    // "is this object on the block you proved?", never "did you place it?".
    // Without the block check a caller could use one owned block as a credential
    // for objects standing on someone else's.
    const existingMap = new Map<string, { id: string; blockHeight: number; locked: boolean }>();
    if (idsToCheck.length > 0) {
      const existing = await prisma.blockObject.findMany({
        where: { id: { in: idsToCheck } },
        select: { id: true, blockHeight: true, locked: true },
      });
      for (const obj of existing) {
        existingMap.set(obj.id, obj);
      }
    }

    // Validation pass: reject the entire batch (and preserve the nonce) if any
    // sub-op is malformed, references a missing object, or targets a resource the
    // caller does not own / that is locked.
    for (const op of operations) {
      if (op.action === 'create') {
        const safeData = op.data ? pickAllowed(op.data) : {};
        if (!safeData.objectType || typeof safeData.objectType !== 'string') {
          return NextResponse.json({ error: 'Invalid batch: create op requires objectType' }, { status: 400 });
        }
      } else if (op.action === 'update') {
        if (!op.id || !op.data) {
          return NextResponse.json({ error: 'Invalid batch: update op requires id and data' }, { status: 400 });
        }
        const existing = existingMap.get(op.id);
        if (!existing) {
          return NextResponse.json({ error: `Invalid batch: update target ${op.id} not found` }, { status: 403 });
        }
        // No unlock intent here: `locked` is not in this route's field allowlist,
        // so a batch could never actually clear the flag. Unlock via PATCH.
        const allowed = authorizeObjectWrite(existing, blockHeight);
        if (!allowed.ok) return gateDenialResponse(allowed);
      } else if (op.action === 'delete') {
        if (!op.id) {
          return NextResponse.json({ error: 'Invalid batch: delete op requires id' }, { status: 400 });
        }
        const existing = existingMap.get(op.id);
        if (!existing) {
          return NextResponse.json({ error: `Invalid batch: delete target ${op.id} not found` }, { status: 403 });
        }
        const allowed = authorizeObjectWrite(existing, blockHeight);
        if (!allowed.ok) return gateDenialResponse(allowed);
      } else {
        return NextResponse.json({ error: `Invalid batch: unknown action ${op.action}` }, { status: 400 });
      }
    }

    // REPLAY PROTECTION: only now — after the whole batch is known valid — consume
    // the exact one-time nonce the signed binding carried.
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    // Execution pass: every sub-op already validated above.
    const results: { action: string; id?: string; success: boolean; error?: string }[] = [];

    for (const op of operations) {
      try {
        if (op.action === 'create' && op.data) {
          const safeData = pickAllowed(op.data);
          const obj = await prisma.blockObject.create({
            data: { blockHeight, ownerAddress, objectType: safeData.objectType as string, ...safeData },
          });
          results.push({ action: 'create', id: obj.id, success: true });
        } else if (op.action === 'update' && op.id && op.data) {
          const safeData = pickAllowed(op.data);
          await prisma.blockObject.update({ where: { id: op.id }, data: safeData });
          results.push({ action: 'update', id: op.id, success: true });
        } else if (op.action === 'delete' && op.id) {
          await prisma.blockObject.delete({ where: { id: op.id } });
          results.push({ action: 'delete', id: op.id, success: true });
        }
      } catch (e) {
        results.push({ action: op.action, id: op.id, success: false, error: 'Operation failed' });
      }
    }

    // Fire-and-forget: single event summarizing the batch write.
    const opCounts = results.reduce(
      (acc, r) => {
        acc[r.action] = (acc[r.action] || 0) + (r.success ? 1 : 0);
        return acc;
      },
      {} as Record<string, number>,
    );
    void emitAgentEvent(blockHeight, 'world_updated', {
      actor: ownerAddress,
      op: 'batch',
      opCounts,
      totalOps: operations.length,
      summary: `Owner batch-updated block #${blockHeight}: ${JSON.stringify(opCounts)}`,
    });

    return NextResponse.json({ results }, { headers: rl.headers });
  } catch (err) {
    console.error('[World Batch]', err);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
