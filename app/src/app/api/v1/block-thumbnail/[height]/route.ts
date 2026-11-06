import { NextRequest, NextResponse } from 'next/server';
import { getBlockThumbnail } from '@/lib/block-thumbnail';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { isAboveTip } from '@/lib/block-summary';

function pngResponse(bytes: Uint8Array, cacheControl: string, source: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': cacheControl,
      'X-Thumbnail-Source': source,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-block-thumbnail-height' });
  if (rl.response) return rl.response;

  const { height: heightStr } = await params;

  // Strip .png suffix if present; the rest must be a plain height in range.
  const height = parseBlockHeight(heightStr.replace(/\.png$/i, ''));
  if (height === null) {
    return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });
  }
  // Not mined yet: no picture. An unreadable tip answers false and renders as before.
  if (await isAboveTip(height)) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Cache, live render or estimate; see lib/block-thumbnail.
  const thumbnail = await getBlockThumbnail(height);
  return pngResponse(thumbnail.png, thumbnail.cacheControl, thumbnail.source);
}
