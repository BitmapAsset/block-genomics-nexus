/**
 * GET /api/v1/blocks/<h>/world/scale[?parcel=<i>]
 *
 * The district's metres (lib/world-scale): without `parcel`, the district
 * (`edge_m`, `area_m2`, `parcels`, `mean_lot_m2`, grid, height cap); with
 * `parcel`, that parcel's rectangle `{index, x_m, y_m, w_m, h_m, area_m2}` in
 * metres from the corner where tx 0 sits. Pure chain data: the same for every
 * caller and independent of the event flag, so it caches like the summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { districtScaleFrom, parcelDimensionsFrom } from '@/lib/world-scale';
import { lookupBlock } from '@/lib/world/server';

const CACHE = 'public, max-age=60, s-maxage=300';

export async function GET(req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-world-scale' });
  if (rl.response) return rl.response;

  const { height: raw } = await params;
  const block = parseBlockHeight(raw);
  if (block === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

  const parcelRaw = req.nextUrl.searchParams.get('parcel');
  if (parcelRaw !== null && !/^\d{1,7}$/.test(parcelRaw)) {
    return NextResponse.json({ error: 'parcel must be a non-negative integer (the transaction index)' }, { status: 400 });
  }

  const looked = await lookupBlock(block);
  if (!looked.ok) return NextResponse.json({ error: looked.error }, { status: looked.status, headers: { 'Cache-Control': 'no-store' } });

  if (parcelRaw === null) {
    return NextResponse.json(districtScaleFrom(block, looked.vsize), { headers: { ...rl.headers, 'Cache-Control': CACHE } });
  }
  const parcel = parcelDimensionsFrom(looked.vsize, Number(parcelRaw));
  if (!parcel) {
    return NextResponse.json(
      { error: `parcel must be 0..${looked.vsize.length - 1} on this block`, code: 'parcel_out_of_range' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json({ block, ...parcel }, { headers: { ...rl.headers, 'Cache-Control': CACHE } });
}
