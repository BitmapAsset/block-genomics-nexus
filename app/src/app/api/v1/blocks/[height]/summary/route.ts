import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { BlockNotFoundError, getBlockSummary, getTipHeight } from '@/lib/block-summary';

/** Six confirmations: deep enough that the block at this height will not change. */
const SETTLED_CONFIRMATIONS = 6;
const NEAR_TIP_MAX_AGE_MS = 60_000;

/**
 * Every transaction's vsize, fee and value in block order — the input the
 * block viewer packs its parcels from, and the same fetch the thumbnail renders.
 * 1,114 txs is ~20 KB; 4,000 is ~90 KB.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-height-summary' });
  if (rl.response) return rl.response;

  const { height: raw } = await params;
  const height = parseBlockHeight(raw);
  if (height === null) {
    return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });
  }

  const tip = await getTipHeight();
  if (tip !== null && height > tip) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  // Unknown tip counts as near the tip: a short cache is always safe.
  const settled = tip !== null && tip - height >= SETTLED_CONFIRMATIONS;

  try {
    const summary = await getBlockSummary(height, settled ? Infinity : NEAR_TIP_MAX_AGE_MS);
    return NextResponse.json(summary, {
      status: 200,
      headers: {
        'Cache-Control': settled ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
      },
    });
  } catch (e) {
    if (e instanceof BlockNotFoundError) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    // Never an estimate here: the viewer labels its own fallback.
    return NextResponse.json(
      { error: 'Block summary unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
