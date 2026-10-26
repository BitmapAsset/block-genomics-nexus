import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyBlockOwnership } from '@/lib/ownership-sync';
import { ownershipAnswer } from '@/lib/onchain/ownership-answer';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { emitDeedVerified } from '@/lib/block-event-emitters';

/**
 * GET /api/v1/ownership/verify?blockHeight=720143
 * Public endpoint — check on-chain ownership for a block
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-ownership-verify', limit: 30 });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
    if (blockHeight === null) {
      return error(`blockHeight query param required — ${INVALID_BLOCK_HEIGHT_MESSAGE}`, 400);
    }

    // DISPLAY tier: a public read-only comparison of DB vs on-chain owner.
    // It authorizes nothing, so it shares the cached observation.
    const check = await verifyBlockOwnership(blockHeight, 'display');

    // Living Block: a live match is an observed `deed.verified`, system-signed
    // (nobody signed anything here) and deduped to one per holder per day, so a
    // public GET cannot be used to flood a block's chain. Once today's event
    // exists, the dedupe answers from one plain read (no transaction, no block
    // lock), so page traffic here never queues behind the block's real writes.
    if (check.match && !check.indeterminate && check.onChainOwnerAddress) {
      await emitDeedVerified({
        block: blockHeight,
        holder: check.onChainOwnerAddress,
        inscriptionId: check.inscriptionId,
        via: 'ownership-check',
      });
    }

    // An outage answers `verdict: 'unknown'` / `chain: 'unavailable'` with
    // `match: null`, never `match: false` (see lib/onchain/ownership-answer).
    return success(ownershipAnswer(check));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
