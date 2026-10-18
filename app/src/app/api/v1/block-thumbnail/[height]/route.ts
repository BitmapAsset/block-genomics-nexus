import { NextRequest, NextResponse } from 'next/server';
import { getBlockThumbnail } from '@/lib/block-thumbnail';
import { enforceRateLimit } from '@/lib/api-rate-limit';

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

  // Strip .png suffix if present
  const cleanHeight = heightStr.replace(/\.png$/i, '');
  const height = parseInt(cleanHeight, 10);
  if (isNaN(height) || height < 0) {
    return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });
  }

  // Cache, live render or estimate; see lib/block-thumbnail.
  const thumbnail = await getBlockThumbnail(height);
  return pngResponse(thumbnail.png, thumbnail.cacheControl, thumbnail.source);
}
