/**
 * GET /api/v1/blocks/<h>/events?after=<seq>&limit=<n ≤ 200>
 *
 * The block's public `bg-event/1` feed (Living Block, spec §5.2/§5.3), in
 * ascending `seq`. Without `after` it is the newest `limit` events (first load);
 * with `after` it is everything after that seq (catch-up and gap-fill). Each
 * event carries its `hash`, its `prev` and a `proof.url`, so a reader can check
 * the chain and every signature without trusting this server.
 *
 * Until BG_EVENTS_ENABLED is on and the BlockEvent migration is applied this
 * answers `{ enabled: false, events: [] }` with a 200, never an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { listBlockEvents, EVENTS_PAGE_MAX } from '@/lib/block-events';

const CACHE = 'public, max-age=0, s-maxage=5';

function parseCount(raw: string | null, min: number, max: number): number | null | 'bad' {
  if (raw === null || raw === '') return null;
  if (!/^\d+$/.test(raw)) return 'bad';
  const n = Number(raw);
  return n >= min && n <= max ? n : 'bad';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-events' });
  if (rl.response) return rl.response;

  const { height: raw } = await params;
  const block = parseBlockHeight(raw);
  if (block === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

  const after = parseCount(req.nextUrl.searchParams.get('after'), 0, 2_147_483_647);
  const limit = parseCount(req.nextUrl.searchParams.get('limit'), 1, EVENTS_PAGE_MAX);
  if (after === 'bad') return NextResponse.json({ error: 'after must be a non-negative integer seq' }, { status: 400 });
  if (limit === 'bad') return NextResponse.json({ error: `limit must be an integer from 1 to ${EVENTS_PAGE_MAX}` }, { status: 400 });

  try {
    const page = await listBlockEvents(block, { after, limit: limit ?? 50 });
    return NextResponse.json(page, { headers: { ...rl.headers, 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[block events GET]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Events unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
