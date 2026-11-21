import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { enforceRateLimit, ESTATE_WRITE_LIMIT } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { consumeChallenge } from '@/lib/challenges';
import { getStreamEmbedUrl, normaliseStreamUrl, STREAM_URL_MAX, streamTypeOf } from '@/lib/stream-embed';
import { STREAM_GET_BUDGET_MS, streamExpired, streamHolderState } from '@/lib/stream-visibility';

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

  // Shown for 12 hours after its latest signed start, and only while the wallet
  // that signed it holds the block (lib/stream-visibility.ts). A hidden stream
  // names no address, link or player.
  if (streamExpired(block.streamStartedAt)) return NextResponse.json({ live: false, ended: 'expired' });
  const holder = await streamHolderState(blockHeight, block.streamOwner, STREAM_GET_BUDGET_MS);
  if (holder !== 'holds') return NextResponse.json({ live: false, ended: holder === 'not_holder' ? 'holder_changed' : 'unconfirmed' });

  return NextResponse.json({
    live: true,
    streamUrl: normaliseStreamUrl(block.streamUrl),
    streamType: streamTypeOf(block.streamType),
    startedAt: block.streamStartedAt,
    embedUrl: getStreamEmbedUrl(block.streamUrl),
    startedBy: block.streamOwner,
  });
}

/* ─── POST: Start a stream (owner only, BIP-322 authenticated) ─── */
export async function POST(req: NextRequest) {
  // Limit BEFORE any chain work: a start is one live chain call per attempt.
  const rlStart = await enforceRateLimit(req, { bucket: 'v1-livestream-write', limit: ESTATE_WRITE_LIMIT });
  if (rlStart.response) return rlStart.response;

  try {
    const body = await req.json();
    const { blockHeight, streamUrl, streamType, walletAddress, signature, message } = body;

    if (!blockHeight || !streamUrl || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // A link is short: a longer value is refused before any signature or chain work.
    if (typeof streamUrl !== 'string' || streamUrl.length > STREAM_URL_MAX) {
      return NextResponse.json({ error: 'That stream link is too long. Paste the plain link to your stream.' }, { status: 400 });
    }

    // The canonical 'livestream.start' message for this block and body, with a
    // one-time 'world' nonce (the same purpose as ending a stream).
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'livestream.start', method: 'POST', path: '/api/v1/livestream',
      blockHeight: Number(blockHeight), purpose: 'world',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // OWNERSHIP — asked of the chain, not of our cache. `Block.ownerAddress` is
    // refreshed by a background sync, so between an on-chain sale and the next
    // run it still names the seller, and authorizing from it let a seller keep
    // broadcasting on land they had already sold. An outage is a retryable 503.
    const owns = await requireLiveBlockOwner(walletAddress, blockHeight);
    if (!owns.ok) {
      return NextResponse.json({ error: owns.reason ?? 'Not block owner' }, { status: owns.status });
    }

    // Validate URL. Store and serve the normalised form, never the raw input.
    const embed = getStreamEmbedUrl(streamUrl);
    const normalisedUrl = normaliseStreamUrl(streamUrl);
    if (!embed || !normalisedUrl) {
      return NextResponse.json({ error: 'Unsupported stream URL. Use YouTube, Twitch, or Kick.' }, { status: 400 });
    }

    // Start stream
    await prisma.block.update({
      where: { height: blockHeight },
      data: {
        streamUrl: normalisedUrl,
        streamType: streamTypeOf(streamType),
        streamStartedAt: new Date(),
        streamOwner: walletAddress,
      },
    });

    return NextResponse.json({ ok: true, embedUrl: embed });
  } catch {
    return NextResponse.json({ error: 'Failed to start stream' }, { status: 500 });
  }
}

/* ─── DELETE: End a stream (its starter or the block's live holder, action-bound signature) ─── */
export async function DELETE(req: NextRequest) {
  // Limit BEFORE any chain work: a holder's end is one live chain call per attempt.
  const rlEnd = await enforceRateLimit(req, { bucket: 'v1-livestream-write', limit: ESTATE_WRITE_LIMIT });
  if (rlEnd.response) return rlEnd.response;

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
    if (!block || !block.streamUrl) {
      return NextResponse.json({ error: 'Not the stream owner' }, { status: 403 });
    }
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401 });
    }
    // The starter may end their stream; so may the wallet that holds the block
    // right now, asked of the chain on the auth tier: a buyer never inherits a
    // stream they cannot remove. The nonce is spent first, so every chain
    // question here costs one signed, one-time request.
    if (block.streamOwner !== ownerAddress) {
      const holder = await requireLiveBlockOwner(ownerAddress, blockHeight);
      if (!holder.ok) {
        if (holder.status === 503) {
          return NextResponse.json({ error: holder.reason }, { status: 503, headers: { 'Retry-After': '15' } });
        }
        return NextResponse.json({ error: 'Not the stream owner or the holder of this block' }, { status: 403 });
      }
    }

    // Clear only the stream that was read: a start that landed since is kept.
    const cleared = await prisma.block.updateMany({
      where: { height: blockHeight, streamOwner: block.streamOwner },
      data: { streamUrl: null, streamType: null, streamStartedAt: null, streamOwner: null },
    });
    if (cleared.count === 0) {
      return NextResponse.json({ error: 'The stream changed. Nothing was ended.' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to end stream' }, { status: 500 });
  }
}
