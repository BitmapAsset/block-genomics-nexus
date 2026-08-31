import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyBlockOwnership } from '@/lib/ownership-sync';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

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

    return success({
      blockHeight: check.blockHeight,
      dbOwner: check.dbOwnerAddress,
      onChainOwner: check.onChainOwnerAddress,
      match: check.match,
      inscriptionId: check.inscriptionId,
      action: check.action,
      lastChecked: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
