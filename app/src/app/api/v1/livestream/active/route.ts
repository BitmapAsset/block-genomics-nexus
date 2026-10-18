import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { getStreamEmbedUrl } from '@/lib/stream-embed';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-livestream-active' });
  if (rl.response) return rl.response;

  try {
    const blocks = await prisma.block.findMany({
      where: { streamUrl: { not: null } },
      select: {
        height: true,
        streamUrl: true,
        streamType: true,
        streamStartedAt: true,
        streamOwner: true,
        label: true,
        owner: { select: { handle: true } },
      },
      orderBy: { streamStartedAt: 'desc' },
      take: 50,
    });

    const streams = blocks.map(b => ({
      blockHeight: b.height,
      streamUrl: b.streamUrl!,
      streamType: b.streamType || 'broadcast',
      startedAt: b.streamStartedAt?.toISOString() || new Date().toISOString(),
      embedUrl: getStreamEmbedUrl(b.streamUrl!) || '',
      ownerHandle: b.owner?.handle || null,
      ownerAddress: b.streamOwner,
      label: b.label,
    }));

    return NextResponse.json({ streams, count: streams.length });
  } catch {
    return NextResponse.json({ streams: [], count: 0 });
  }
}
