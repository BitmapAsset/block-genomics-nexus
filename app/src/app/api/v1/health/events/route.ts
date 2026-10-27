import { NextRequest } from 'next/server';
import { success } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { eventStats } from '@/lib/block-events';

/**
 * GET /api/v1/health/events
 *
 * Whether the Living Block event spine is on, and what THIS server instance has
 * emitted and lost since its process started: `{ enabled, emitted, lost,
 * lastLossAt, backoffUntil }`. A lost event is one an enabled emitter should
 * have stored and did not (transaction failed or ran past its 5 s budget, or
 * the `BlockEvent` table is missing; `backoffUntil` is set while that
 * table-missing back-off lasts). The counts live in memory: every serverless
 * instance keeps its own and a cold start begins at zero, so read them as a
 * sample, not a fleet total. Read-only, touches no database, never cached,
 * carries no secrets.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-health-events' });
  if (rl.response) return rl.response;

  const s = eventStats();
  return success(
    {
      enabled: s.enabled,
      emitted: s.emitted,
      lost: s.lost,
      lastLossAt: s.lastLossAt,
      backoffUntil: s.backoffUntil,
      scope: 'instance',
      since: s.since,
      note: 'Counts are per server instance since its process started; other instances keep their own.',
    },
    200,
    NO_STORE,
  );
}
