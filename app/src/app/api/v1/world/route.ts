import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { emitAgentEvent } from '@/lib/agent-events';
import { requireVerifiedBlock, gateDenialResponse, sessionTokenFromHeaders } from '@/lib/ownership-gate';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { looksLikeSessionToken } from '@/lib/verified-sessions';
import { enforceRateLimit, WORLD_WRITE_LIMIT } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-world' });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    if (blockHeight === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

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
  // §10: writes were the one unprotected side of this route. Each one costs a
  // live indexer call before it costs a database write, so the ceiling is lower
  // than the public read ceiling above.
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-write', limit: WORLD_WRITE_LIMIT });
  if (rl.response) return rl.response;

  try {
    const body = await req.json();
    const { blockHeight, objectType, signature, message } = body;

    if (!blockHeight || !objectType) {
      return NextResponse.json({ error: 'blockHeight and objectType required' }, { status: 400 });
    }

    // Two ways to authorize this build, both ending at "you own this block":
    //
    //   AGENT   — `Authorization: Bearer bg_vfy_…`. The ownership gate checks the
    //             session is live, the block is in its proven scope, and the
    //             wallet STILL holds the inscription on-chain right now.
    //   WALLET  — an action-bound BIP-322 signature, the browser path, unchanged.
    //
    // The actor is never read from the request body on the agent path: it comes
    // from the session, so a token cannot attribute writes to another wallet.
    let ownerAddress: string;

    if (looksLikeSessionToken(sessionTokenFromHeaders(req.headers))) {
      const gate = await requireVerifiedBlock(req, blockHeight);
      if (!gate.ok) return gateDenialResponse(gate);
      ownerAddress = gate.walletAddress!;
    } else if (!signature || !message) {
      // No credential of either kind. Answer the question the caller actually
      // has — "how do I become allowed to do this?" — rather than a 400 about a
      // missing body field.
      return gateDenialResponse({
        ok: false,
        status: 401,
        code: 'unverified',
        reason:
          'Building on a block requires proof that you own it. Verify with a bg_vfy_ session token, ' +
          'or send an action-bound BIP-322 signature.',
      });
    } else {
      ownerAddress = body.ownerAddress;
      if (!ownerAddress) {
        return NextResponse.json({ error: 'ownerAddress required' }, { status: 400 });
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

      // LIVE OWNERSHIP: the signature proves the wallet, not what it owns. This
      // used to read `Block.ownerAddress` — our background-synced cache — which
      // between an on-chain sale and the next sync still names the seller. Ask
      // the chain instead, before burning the nonce so an indexer outage costs a
      // retry rather than another signing round-trip.
      const owns = await requireSignedBlockOwner(ownerAddress, blockHeight);
      if (!owns.ok) return gateDenialResponse(owns);

      // REPLAY PROTECTION: atomically consume the exact one-time nonce the signed
      // binding carried (not any nonce that happens to appear in the message) so a
      // captured signed mutation cannot be resubmitted.
      if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
        return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
      }
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

    return NextResponse.json({ object }, { status: 201, headers: rl.headers });
  } catch (err) {
    console.error('[World POST]', err);
    return NextResponse.json({ error: 'Failed to create object' }, { status: 500 });
  }
}
