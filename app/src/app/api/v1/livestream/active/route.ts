import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { getStreamEmbedUrl, normaliseStreamUrl } from '@/lib/stream-embed';
import { STREAM_LIST_BUDGET_MS, STREAM_LIST_GROUP, STREAM_MAX_AGE_MS, streamHolderState } from '@/lib/stream-visibility';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const deadline = Date.now() + STREAM_LIST_BUDGET_MS;
  const rl = await enforceRateLimit(req, { bucket: 'v1-livestream-active' });
  if (rl.response) return rl.response;

  try {
    const blocks = await prisma.block.findMany({
      where: { streamUrl: { not: null }, streamStartedAt: { gt: new Date(Date.now() - STREAM_MAX_AGE_MS) } },
      select: {
        height: true,
        streamUrl: true,
        streamType: true,
        streamStartedAt: true,
        streamOwner: true,
        ownerAddress: true,
        label: true,
        owner: { select: { handle: true } },
      },
      orderBy: { streamStartedAt: 'desc' },
      take: 50,
    });

    // Shown only while the wallet that signed the latest start holds the block
    // (lib/stream-visibility.ts). Rows are asked four at a time against one
    // deadline; a row not confirmed in time is left out and counted in
    // `checking`, and its lookup runs on for the next request.
    const shown: typeof blocks = [];
    let checking = 0;
    let passed = false;
    for (let i = 0; i < blocks.length; i += STREAM_LIST_GROUP) {
      const group = blocks.slice(i, i + STREAM_LIST_GROUP);
      const left = deadline - Date.now();
      if (passed || left <= 0) { checking += group.length; continue; }
      const states = await Promise.all(group.map(b => streamHolderState(b.height, b.streamOwner, left)));
      // A late answer means the deadline has passed on the timer's clock.
      if (states.includes('late')) passed = true;
      group.forEach((b, j) => {
        if (states[j] === 'holds') shown.push(b);
        else if (states[j] === 'late') checking++;
      });
    }

    const streams = shown.map(b => {
      // The recorded owner's handle and label name the recorded owner: shown
      // only beside their own stream, never beside another wallet's.
      const own = b.ownerAddress === b.streamOwner;
      return {
        blockHeight: b.height,
        streamUrl: normaliseStreamUrl(b.streamUrl) ?? '',
        streamType: b.streamType || 'broadcast',
        startedAt: b.streamStartedAt?.toISOString() || new Date().toISOString(),
        embedUrl: getStreamEmbedUrl(b.streamUrl!) || '',
        ownerHandle: own ? b.owner?.handle || null : null,
        ownerAddress: b.streamOwner,
        label: own ? b.label : null,
      };
    });

    return NextResponse.json({ streams, count: streams.length, checking });
  } catch {
    return NextResponse.json({ streams: [], count: 0, checking: 0 });
  }
}
