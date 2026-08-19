import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let videoId = u.searchParams.get('v');
      if (!videoId && u.hostname.includes('youtu.be')) videoId = u.pathname.slice(1);
      if (!videoId) { const m = u.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/); if (m) videoId = m[1]; }
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
    }
    if (u.hostname.includes('twitch.tv')) {
      const ch = u.pathname.split('/').filter(Boolean)[0];
      if (ch) return `https://player.twitch.tv/?channel=${ch}&parent=blockgenomics.io&autoplay=true&muted=true`;
    }
    if (u.hostname.includes('kick.com')) {
      const ch = u.pathname.split('/').filter(Boolean)[0];
      if (ch) return `https://player.kick.com/${ch}`;
    }
    return null;
  } catch { return null; }
}

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
      embedUrl: getEmbedUrl(b.streamUrl!) || '',
      ownerHandle: b.owner?.handle || null,
      ownerAddress: b.streamOwner,
      label: b.label,
    }));

    return NextResponse.json({ streams, count: streams.length });
  } catch {
    return NextResponse.json({ streams: [], count: 0 });
  }
}
