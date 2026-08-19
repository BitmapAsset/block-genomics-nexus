import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyBlockOwnership } from '@/lib/ownership-sync';
import { enforceRateLimit } from '@/lib/api-rate-limit';

/**
 * GET /api/v1/ownership/verify?blockHeight=720143
 * Public endpoint — check on-chain ownership for a block
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-ownership-verify', limit: 30 });
  if (rl.response) return rl.response;

  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '', 10);
    if (isNaN(blockHeight) || blockHeight <= 0) {
      return error('blockHeight query param required (positive integer)', 400);
    }

    const check = await verifyBlockOwnership(blockHeight);

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
