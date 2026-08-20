/**
 * POST /api/v1/estates — name a group of parcels on a block you own.
 *
 * This route used to answer "does this wallet own the block?" with
 * `Block.ownerAddress` — our own cache, refreshed by a background sync. That is
 * the exact failure #124 closed everywhere else: between an on-chain sale and
 * the next sync the cache still names the seller, so a seller could keep
 * carving up land they no longer owned while the buyer was refused on the block
 * they had just bought. A bare BIP-322 signature sat in front of it, which
 * proves wallet control and nothing about ownership, and was never bound to
 * this action nor consumed as a one-time nonce, so a captured signature could
 * be replayed here forever.
 *
 * Both halves are now the same fail-closed path every other mutating route
 * takes: a `bg_vfy_` session token, which only exists because a BIP-322
 * signature over a one-time challenge was verified, checked by the ownership
 * gate for identity, scope, and — the part that matters — that the wallet still
 * holds this block's inscription RIGHT NOW. An indexer outage is a retryable
 * 503, never a grant.
 *
 * The bare-signature body is gone rather than repaired. It authorized from the
 * cache with no replay protection, the browser already mints a session token in
 * the estate flow, and this surface is not in the published OpenAPI contract, so
 * there is no caller to keep it alive for. Denials carry VERIFY_STEPS, which is
 * the migration path.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString } from '@/lib/api-helpers';
import { requireVerifiedBlock, gateDenialResponse } from '@/lib/ownership-gate';
import { enforceRateLimit, ESTATE_WRITE_LIMIT } from '@/lib/api-rate-limit';

export async function POST(req: NextRequest) {
  // Limit BEFORE any chain work, so a throttled request never reaches the
  // indexer — the ownership gate is one live call per attempt.
  const rl = await enforceRateLimit(req, { bucket: 'v1-estates-write', limit: ESTATE_WRITE_LIMIT });
  if (rl.response) return rl.response;

  try {
    const body = await req.json().catch(() => null);
    const { name, blockHeight, parcelIndices, glowColor } = body ?? {};

    if (!Number.isInteger(blockHeight) || blockHeight < 0) {
      return error('A valid integer blockHeight is required', 400);
    }
    if (typeof name !== 'string' || !name.trim()) return error('name is required', 400);
    if (!Array.isArray(parcelIndices)) return error('parcelIndices[] is required', 400);

    const indices = [...new Set(
      parcelIndices.filter((i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0),
    )].sort((a, b) => a - b);
    if (indices.length === 0) return error('Invalid parcelIndices', 400);

    // AUTHORIZATION — identity, scope, and a live on-chain holder check. The
    // owner is taken from the proven session, never from the request body, so a
    // token cannot attribute an estate to another wallet.
    const gate = await requireVerifiedBlock(req, blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);
    const ownerAddress = gate.walletAddress!;

    // `Estate` carries required foreign keys to both `User` and `Block`, and a
    // wallet can prove ownership on-chain without ever having touched this
    // database — which is why estates were never landing. Both parents are
    // created from what the gate just proved, in the same transaction as the
    // estate, so a failure leaves no half-written owner behind.
    const estate = await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { walletAddress: ownerAddress },
        update: {},
        create: { walletAddress: ownerAddress },
      });
      // Writing the owner here is a cache refresh from a fact just verified
      // live, not a cache read standing in for one.
      await tx.block.upsert({
        where: { height: blockHeight },
        update: { ownerAddress },
        create: { height: blockHeight, ownerAddress },
      });
      return tx.estate.create({
        data: {
          name: sanitizeString(name, 100),
          ownerAddress,
          blockHeight,
          parcelIndices: JSON.stringify(indices),
          glowColor: typeof glowColor === 'string' ? sanitizeString(glowColor, 7) : null,
        },
      });
    });

    return success({ ...estate, parcelIndices: indices }, 201, rl.headers);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
