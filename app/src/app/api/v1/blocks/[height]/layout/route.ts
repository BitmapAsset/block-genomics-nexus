import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { BlockNotFoundError, getBlockSummary, getTipHeight, isSettledHeight } from '@/lib/block-summary';
import { completeSatTotals, layoutBlock } from '@/lib/bitmap-layout';

const NEAR_TIP_MAX_AGE_MS = 60_000;

/**
 * The block's canonical Bitmap layout (lib/bitmap-layout): one square per
 * transaction, side from its output total, packed in block order. Every client
 * that draws a block (thumbnails, map tiles, the 3D district) reads this, so
 * they all draw the picture bitmap.land and Magic Eden show.
 *
 * `squares[i]` is `[x, y, size]` for transaction i, in grid units. Built from
 * the same cached mempool summary as `/summary`; never an estimate: when the
 * summary (or one output total) is missing the answer is 503 `unavailable`
 * and the caller shows its own labelled skeleton.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-height-layout' });
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
  // An old height is settled without the tip; above it an unknown tip counts as near the tip.
  const settled = isSettledHeight(height, tip);

  const unavailable = () =>
    NextResponse.json(
      { height, source: 'unavailable', error: 'Block layout unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );

  try {
    const summary = await getBlockSummary(height, settled ? Infinity : NEAR_TIP_MAX_AGE_MS);
    const sats = completeSatTotals(summary.value);
    if (!sats || sats.length !== summary.txCount) return unavailable();
    const layout = layoutBlock(sats);
    return NextResponse.json(
      {
        height,
        txCount: summary.txCount,
        gridLength: layout.gridLength,
        gridWidth: layout.width,
        gridHeight: layout.height,
        sizes: layout.sizes,
        squares: layout.squares.map((q) => [q.x, q.y, q.size]),
        source: 'live',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': settled ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
        },
      },
    );
  } catch (e) {
    if (e instanceof BlockNotFoundError) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return unavailable();
  }
}
