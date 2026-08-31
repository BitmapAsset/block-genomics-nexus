import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { getBlockMarket } from '@/lib/marketplace';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

/**
 * `GET /api/v1/blocks/[height]/market` — what venues are advertising for a block.
 *
 * Advisory data only. The response carries `advisory: true` and must never be
 * used to decide who controls a block; that answer lives at
 * `/api/v1/ownership/verify` and is settled on-chain. See
 * `lib/marketplace/index.ts` for the full rationale.
 *
 * Rate limited like the other public reads, but for a sharper reason than most:
 * each miss can cost a call against a metered third-party API key, so an
 * unlimited caller here is a bill, not just load.
 */

/** Tighter than the default public read: cache misses cost metered upstream calls. */
const MARKET_READ_LIMIT = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-market', limit: MARKET_READ_LIMIT });
  if (rl.response) return rl.response;

  try {
    const gate = await sandboxGate(req);
    if (gate.response) return gate.response;

    const { height } = await params;
    const h = parseBlockHeight(height);
    if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    // The inscription id is the venue-side identity of a bitmap, so it is read
    // here rather than inside the lane — the lane stays free of database
    // coupling and can be exercised with a plain query object.
    const block = await prisma.block.findUnique({
      where: { height: h },
      select: { inscriptionId: true },
    });

    const market = await getBlockMarket({ height: h, inscriptionId: block?.inscriptionId ?? null });

    return success(market, 200, gate.headers);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
