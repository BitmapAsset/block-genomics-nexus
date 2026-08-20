import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { emitAgentEvent } from '@/lib/agent-events';
import { requireSignedBlockOwner, authorizeObjectWrite } from '@/lib/block-write-auth';
import { gateDenialResponse, requireVerifiedBlock, sessionTokenFromHeaders } from '@/lib/ownership-gate';
import { looksLikeSessionToken } from '@/lib/verified-sessions';
import { enforceRateLimit, WORLD_BATCH_LIMIT } from '@/lib/api-rate-limit';

// H-03: Allowlist of fields for block objects
const ALLOWED_OBJECT_FIELDS = ['objectType', 'geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible'];

const MAX_OPERATIONS = 100;

/**
 * Ceiling for the whole batch write, well above the ~200ms a full 100-op batch
 * costs. Prisma's 5s default is a per-transaction budget, and a batch is the one
 * route that can legitimately issue 100 statements in one go.
 */
const BATCH_TX_TIMEOUT_MS = 15_000;

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

interface AuthorizedBatch {
  ownerAddress: string;
  /**
   * Spend the one-time nonce, on the credential path that has one. Deliberately
   * deferred: the caller runs it only after every sub-op has been validated, so
   * a forged sub-op rejects the batch with the nonce still intact.
   */
  consumeNonce?: () => Promise<boolean>;
}

/**
 * Authorize this batch by either credential path — everything except spending
 * the nonce.
 *
 *   AGENT  — `Authorization: Bearer bg_vfy_…`. The ownership gate checks the
 *            session is live, the block is in its proven scope, and the wallet
 *            STILL holds the inscription on-chain right now.
 *   WALLET — an action-bound BIP-322 signature over the whole batch, plus a live
 *            on-chain check, then a one-time nonce.
 *
 * Both roads end at the same question — "do you hold this block right now?" —
 * which is what §4.4 requires of every world write. The single-object routes have
 * accepted both since #119; this route accepted only the wallet path, so an agent
 * holding a perfectly good session token had to fall back to 100 single writes
 * (and 100 indexer calls) to do what one batch does.
 *
 * The actor is never read from the request body on the agent path: it comes from
 * the session, so a token cannot attribute writes to another wallet.
 *
 * This runs BEFORE sub-op validation. An uncredentialed caller must not be able
 * to learn from a validation error whether some object id exists or which block
 * it stands on.
 */
async function authorizeBatch(
  req: NextRequest,
  body: Record<string, unknown>,
  blockHeight: number,
): Promise<AuthorizedBatch | { response: NextResponse }> {
  if (looksLikeSessionToken(sessionTokenFromHeaders(req.headers))) {
    const gate = await requireVerifiedBlock(req, blockHeight);
    if (!gate.ok) return { response: gateDenialResponse(gate) };
    // No nonce on this path: the session token IS the credential, and it was
    // itself minted from a signed one-time challenge. See §7.3 for what that
    // means for retries.
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
          'Batch-building on a block requires proof that you own it. Verify with a bg_vfy_ session token, ' +
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

  // ACTION BINDING: signature must authorize THIS batch (incl. operations) on THIS block.
  const binding = verifyActionBinding(message, {
    action: 'world.batch',
    method: 'POST',
    path: '/api/v1/world/batch',
    blockHeight,
    bodyHash: await hashBody(body),
  });
  if (!binding.ok) {
    return { response: NextResponse.json({ error: binding.reason }, { status: 401 }) };
  }

  // LIVE OWNERSHIP, asked once against the chain rather than the
  // `Block.ownerAddress` cache, and covering every sub-op: holding the block is
  // what authorizes touching the things on it. Checked BEFORE the nonce is
  // burned so an indexer outage costs a retry rather than another signing
  // round-trip.
  const owns = await requireSignedBlockOwner(ownerAddress, blockHeight);
  if (!owns.ok) return { response: gateDenialResponse(owns) };

  // REPLAY PROTECTION: the exact one-time nonce the signed binding carried (not
  // any nonce that happens to appear in the message). Handed back unspent — the
  // caller burns it only once the whole batch is known valid.
  return {
    ownerAddress,
    consumeNonce: () => consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }),
  };
}

export async function POST(req: NextRequest) {
  // §10: one batch is up to 100 sub-ops, so it gets a tighter ceiling than the
  // single-object write routes.
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-batch', limit: WORLD_BATCH_LIMIT });
  if (rl.response) return rl.response;

  try {
    const body = await req.json();
    const { blockHeight, operations } = body as { blockHeight: number; operations: BatchOp[] };

    if (!blockHeight || !operations?.length) {
      return NextResponse.json({ error: 'blockHeight and operations required' }, { status: 400 });
    }

    if (operations.length > MAX_OPERATIONS) {
      return NextResponse.json({ error: `Max ${MAX_OPERATIONS} operations per batch` }, { status: 400 });
    }

    // Prove the caller holds this block, by whichever credential they present.
    // Everything below this line is reachable only by the block's owner.
    const auth = await authorizeBatch(req, body, blockHeight);
    if ('response' in auth) return auth.response;
    const { ownerAddress } = auth;

    // OWNERSHIP + RESOURCE VALIDATION BEFORE NONCE BURN: like the single PATCH/
    // DELETE routes, every sub-op's ownership and resource existence is validated
    // up front. A forged or unauthorized sub-op rejects the whole batch with the
    // nonce preserved, so an attacker cannot burn a victim's valid nonce on a bad
    // batch.
    //
    // Batch-fetch all existing targets (eliminates N+1). `blockHeight` is
    // selected and `ownerAddress` is not: the sub-op check is "is this object on
    // the block you proved?", never "did you place it?". Without the block check
    // a caller could use one owned block as a credential for objects standing on
    // someone else's.
    const idsToCheck = operations
      .filter(op => (op.action === 'update' || op.action === 'delete') && op.id)
      .map(op => op.id!);

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

    // Only now — after the whole batch is known valid — spend the one-time
    // nonce, on the credential path that carries one.
    if (auth.consumeNonce && !(await auth.consumeNonce())) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }

    // EXECUTION — ALL OR NOTHING.
    //
    // This used to run the sub-ops one at a time outside a transaction and
    // report per-op `success: false` inside a 200. A batch could therefore
    // half-apply, and the caller had no safe move: the nonce was spent, so
    // resending was impossible, and it could not tell which sub-ops had landed
    // without diffing the block. Wrapping the batch makes the outcome binary —
    // the whole batch applied, or nothing did — which is what makes the retry
    // rules in §7.3 statable at all.
    const results = await prisma.$transaction(
      async (tx) => {
        const applied: { action: string; id?: string; success: true }[] = [];
        for (const op of operations) {
          if (op.action === 'create' && op.data) {
            const safeData = pickAllowed(op.data);
            const obj = await tx.blockObject.create({
              data: { blockHeight, ownerAddress, objectType: safeData.objectType as string, ...safeData },
            });
            applied.push({ action: 'create', id: obj.id, success: true });
          } else if (op.action === 'update' && op.id && op.data) {
            await tx.blockObject.update({ where: { id: op.id }, data: pickAllowed(op.data) });
            applied.push({ action: 'update', id: op.id, success: true });
          } else if (op.action === 'delete' && op.id) {
            await tx.blockObject.delete({ where: { id: op.id } });
            applied.push({ action: 'delete', id: op.id, success: true });
          }
        }
        return applied;
      },
      { timeout: BATCH_TX_TIMEOUT_MS },
    );

    // Fire-and-forget: single event summarizing the batch write.
    const opCounts = results.reduce(
      (acc, r) => {
        acc[r.action] = (acc[r.action] || 0) + 1;
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
    // The transaction rolled back, so state is exactly as it was before the
    // call. Say so: the caller's next move depends on knowing that a failed
    // batch is not a partially applied one.
    return NextResponse.json(
      {
        success: false,
        error: 'Batch operation failed — no changes were applied.',
        code: 'batch_failed',
      },
      { status: 500 },
    );
  }
}
