import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { getChainHealth } from '@/lib/onchain/chain-health';

/**
 * GET /api/v1/health/chain
 *
 * Whether the chain sources behind ownership answers are reachable: each ord
 * host (status, latency, tip, version), each Esplora provider, and whether the
 * sat tracker is on. Answers 200 whatever the upstreams say — an unreachable
 * chain is reported in the body (`chain: "degraded" | "unavailable"`), so a 5xx
 * here means this route itself broke. Never cached; carries no secrets.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-health-chain' });
  if (rl.response) return rl.response;

  try {
    return success(await getChainHealth(), 200, NO_STORE);
  } catch (e: unknown) {
    console.error('[health/chain] probe failed:', e instanceof Error ? e.message : e);
    const res = error('chain health check failed', 500);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
}
