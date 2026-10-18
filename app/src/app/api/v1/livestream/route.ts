import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletSignature, verifyUnboundWalletSignature } from '@/lib/api-helpers';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { consumeChallenge } from '@/lib/challenges';
import { getStreamEmbedUrl } from '@/lib/stream-embed';

export const dynamic = 'force-dynamic';

/* ─── GET: Check if a block has an active stream ─── */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-livestream' });
  if (rl.response) return rl.response;

  const blockHeight = parseBlockHeight(req.nextUrl.searchParams.get('blockHeight'));
  if (blockHeight === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });

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
    embedUrl: getStreamEmbedUrl(block.streamUrl),
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
    const verified = verifyUnboundWalletSignature(walletAddress, message, signature);
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
    const embed = getStreamEmbedUrl(streamUrl);
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

/* ─── DELETE: End a stream (stream owner only, action-bound signature) ─── */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, signature, message } = body;

    if (!blockHeight) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // The stream owner must PROVE it. Comparing a wallet string from the body to
    // `streamOwner` let anyone end any stream (bg47 E2E-07). Same shape as world
    // writes (lib/world-signing.ts): a signature over the action-bound message
    // for this block and body, with a one-time 'world' nonce consumed below.
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: "Ending a stream requires the stream owner's signature" }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const binding = verifyActionBinding(message, {
      action: 'livestream.end',
      method: 'DELETE',
      path: '/api/v1/livestream',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return NextResponse.json({ error: binding.reason || 'Invalid authorization' }, { status: 401 });
    }

    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.streamOwner !== ownerAddress) {
      return NextResponse.json({ error: 'Not the stream owner' }, { status: 403 });
    }
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
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
