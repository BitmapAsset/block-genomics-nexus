/**
 * GET /api/v1/blocks/<h>/world
 *
 * The block's `bg-world/1` manifest: theme, the district's metres (`scale`),
 * the live placements and the newest world event (`head`). It is a projection
 * of the block's signed `world.*` events, so every placement links to the
 * proof of the event that created it.
 *
 * Until BG_EVENTS_ENABLED is on and the BlockEvent migration is applied this
 * answers `enabled: false` with empty placements and the scale still filled.
 * Unknown heights are 404; if mempool is unreachable the manifest still
 * answers, with `scale: null`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { districtScaleFrom } from '@/lib/world-scale';
import { lookupBlock, worldOf } from '@/lib/world/server';

const CACHE = 'public, max-age=0, s-maxage=5';

export async function GET(req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-world' });
  if (rl.response) return rl.response;

  const { height: raw } = await params;
  const block = parseBlockHeight(raw);
  if (block === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

  const looked = await lookupBlock(block);
  if (!looked.ok && looked.status === 404) {
    return NextResponse.json({ error: looked.error }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const scale = looked.ok ? districtScaleFrom(block, looked.vsize) : null;

  try {
    const manifest = await worldOf(block, scale);
    return NextResponse.json(manifest, {
      headers: { ...rl.headers, 'Cache-Control': scale ? CACHE : 'no-store' },
    });
  } catch (err) {
    console.error('[block world GET]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'World unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
