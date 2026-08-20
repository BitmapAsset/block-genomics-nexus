import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

/* ─── GET: Check if a block has an active stream ─── */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-livestream' });
  if (rl.response) return rl.response;

  const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '');
  if (isNaN(blockHeight)) return NextResponse.json({ error: 'Missing blockHeight' }, { status: 400 });

  const block = await prisma.block.findUnique({
    where: { height: blockHeight },
    select: { streamUrl: true, streamType: true, streamStartedAt: true, streamOwner: true },
  });

  if (!block?.streamUrl) {
    return NextResponse.json({ live: false });
  }

  return NextResponse.json({
    live: true,
    streamUrl: block.streamUrl,
    streamType: block.streamType,
    startedAt: block.streamStartedAt,
    embedUrl: getEmbedUrl(block.streamUrl),
  });
}

/* ─── POST: Start a stream (owner only, BIP-322 authenticated) ─── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, streamUrl, streamType, walletAddress, signature, message } = body;

    if (!blockHeight || !streamUrl || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify wallet signature
    const verified = await verifyWalletSignature(walletAddress, message, signature);
    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // OWNERSHIP — asked of the chain, not of our cache. `Block.ownerAddress` is
    // refreshed by a background sync, so between an on-chain sale and the next
    // run it still names the seller, and authorizing from it let a seller keep
    // broadcasting on land they had already sold. An outage is a retryable 503.
    const owns = await requireLiveBlockOwner(walletAddress, blockHeight);
    if (!owns.ok) {
      return NextResponse.json({ error: owns.reason ?? 'Not block owner' }, { status: owns.status });
    }

    // Validate URL
    const embed = getEmbedUrl(streamUrl);
    if (!embed) {
      return NextResponse.json({ error: 'Unsupported stream URL. Use YouTube, Twitch, or Kick.' }, { status: 400 });
    }

    // Start stream
    await prisma.block.update({
      where: { height: blockHeight },
      data: {
        streamUrl,
        streamType: streamType || 'broadcast',
        streamStartedAt: new Date(),
        streamOwner: walletAddress,
      },
    });

    return NextResponse.json({ ok: true, embedUrl: embed });
  } catch {
    return NextResponse.json({ error: 'Failed to start stream' }, { status: 500 });
  }
}

/* ─── DELETE: End a stream (owner only) ─── */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, walletAddress } = body;

    if (!blockHeight || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // No signature needed to end — just verify wallet matches stream owner
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.streamOwner !== walletAddress) {
      return NextResponse.json({ error: 'Not the stream owner' }, { status: 403 });
    }

    await prisma.block.update({
      where: { height: blockHeight },
      data: {
        streamUrl: null,
        streamType: null,
        streamStartedAt: null,
        streamOwner: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to end stream' }, { status: 500 });
  }
}

/* ─── Helpers ─── */
function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);

    // YouTube
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let videoId = u.searchParams.get('v');
      if (!videoId && u.hostname.includes('youtu.be')) videoId = u.pathname.slice(1);
      if (!videoId) {
        // YouTube live URL: youtube.com/live/VIDEO_ID
        const liveMatch = u.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
        if (liveMatch) videoId = liveMatch[1];
      }
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
    }

    // Twitch
    if (u.hostname.includes('twitch.tv')) {
      const channel = u.pathname.split('/').filter(Boolean)[0];
      if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=blockgenomics.io&autoplay=true&muted=true`;
    }

    // Kick
    if (u.hostname.includes('kick.com')) {
      const channel = u.pathname.split('/').filter(Boolean)[0];
      if (channel) return `https://player.kick.com/${channel}`;
    }

    return null;
  } catch {
    return null;
  }
}
