import { NextRequest, NextResponse } from 'next/server';
import { renderBitmapThumbnail, TxInput } from '@/lib/bitmap-renderer';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

function getEpoch(height: number): number {
  return Math.floor(height / 210000) + 1;
}

// Short-lived negative cache: heights whose live fetch failed (mempool down /
// rate-limited / not-yet-mined). Avoids re-running the slow mempool fetches on
// every request for the same height during the window.
const NEGATIVE_TTL_MS = 60_000;
const negativeCache = new Map<number, number>(); // height → expiry timestamp

function isNegativelyCached(height: number): boolean {
  const expiry = negativeCache.get(height);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    negativeCache.delete(height);
    return false;
  }
  return true;
}

/**
 * Rows written before this instant were rendered from the first 25 transactions
 * plus a height-seeded estimate for the rest of the block. They are refreshed in
 * place on their next request (see GET). No bulk purge and no migration: a row
 * stays servable until a full live render replaces it.
 */
const THUMBNAIL_REAL_ART_SINCE = new Date('2026-10-16T21:35:00Z');

/**
 * Live re-renders of stale rows in flight on this instance. The Nexus canvas
 * asks for hundreds of tiles at once and every one is a stale row right after
 * deploy; past the cap the old bytes are served short-TTL and retried later,
 * so a page load cannot herd mempool. Cache-miss renders count toward the
 * total but are not gated (there are no old bytes to fall back on).
 */
const MAX_LIVE_RENDERS = 4;
let liveRenders = 0;

/** One entry of mempool's `GET /api/v1/block/{hash}/summary` (TransactionStripped). */
interface StrippedTx {
  txid?: string;
  vsize?: number;
}

/**
 * Every transaction of the block, with its real vsize.
 *
 * mempool's block summary returns the whole block in one array (`txid`, `fee`,
 * `vsize`, `value`, `rate`, `flags` per tx). A summary that is empty, shorter
 * than the block's `tx_count`, or has a tx without a usable vsize is a failed
 * live fetch: the caller falls back to an estimate and persists nothing.
 */
async function fetchBlockTxs(height: number): Promise<TxInput[]> {
  const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!hashRes.ok) throw new Error('Failed to fetch block hash');
  const hash = (await hashRes.text()).trim();
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error('Bad block hash');

  // Both lookups need only the hash, so overlap them.
  const [blockRes, summaryRes] = await Promise.all([
    fetch(`https://mempool.space/api/block/${hash}`, {
      signal: AbortSignal.timeout(8000),
    }),
    // A 3–4k-tx summary is ~0.6–0.8 MB; keep it out of the Next data cache.
    fetch(`https://mempool.space/api/v1/block/${hash}/summary`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    }),
  ]);
  if (!blockRes.ok) throw new Error('Failed to fetch block info');
  if (!summaryRes.ok) throw new Error('Failed to fetch block summary');
  const block = (await blockRes.json()) as { tx_count?: number };
  const summary = (await summaryRes.json()) as unknown;

  if (!Array.isArray(summary) || summary.length === 0) throw new Error('Empty block summary');
  if (typeof block.tx_count !== 'number' || summary.length !== block.tx_count) {
    throw new Error('Incomplete block summary');
  }

  return (summary as StrippedTx[]).map((tx) => {
    const vsize = tx?.vsize;
    if (typeof vsize !== 'number' || !Number.isFinite(vsize) || vsize <= 0) {
      throw new Error('Block summary tx without vsize');
    }
    return { vbytes: vsize };
  });
}

/** Full live render, counted against the in-flight cap. */
async function renderLive(height: number): Promise<{ png: Buffer; txCount: number }> {
  liveRenders++;
  try {
    const txs = await fetchBlockTxs(height);
    return { png: renderBitmapThumbnail(txs, 256), txCount: txs.length };
  } finally {
    liveRenders--;
  }
}

function longCache(epoch: number): string {
  return epoch <= 4 ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
}

// Estimates and stale rows: short TTL, never immutable, so a later request
// picks up the real render.
const SHORT_CACHE = 'public, max-age=60';

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

/**
 * Deterministic estimated tx set seeded purely by height — no network.
 * Used when the live block is unreachable (negative-cached) so the tile still
 * renders a canonical Mondrian skeleton instead of erroring. Estimates only;
 * NOT persisted to the DB cache (which holds real/live-derived thumbnails).
 */
function estimateTxs(height: number): TxInput[] {
  let seed = (height * 7919 + 17) >>> 0;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  // Plausible tx count by era (mirrors the client-side generator distribution).
  const count = height < 100_000
    ? 1 + Math.floor(rng() * 50)
    : height < 400_000
    ? 10 + Math.floor(rng() * 500)
    : 100 + Math.floor(rng() * 3000);

  const txs: TxInput[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) { txs.push({ vbytes: 200 + Math.floor(rng() * 400) }); continue; }
    const u = rng();
    let vb: number;
    if (u < 0.60) vb = 140 + Math.floor(rng() * 116);
    else if (u < 0.85) vb = 257 + Math.floor(rng() * 543);
    else if (u < 0.95) vb = 801 + Math.floor(rng() * 2199);
    else if (u < 0.99) vb = 3001 + Math.floor(rng() * 12000);
    else vb = 15001 + Math.floor(rng() * 50000);
    txs.push({ vbytes: vb });
  }
  return txs;
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

  const epoch = getEpoch(height);

  // Check cache. Rows from before THUMBNAIL_REAL_ART_SINCE hold estimated art.
  let stale: Uint8Array | null = null;
  try {
    const cached = await prisma.blockThumbnail.findUnique({
      where: { blockHeight: height },
    });
    if (cached) {
      if (cached.createdAt >= THUMBNAIL_REAL_ART_SINCE) {
        return pngResponse(cached.imageData, longCache(epoch), 'cache');
      }
      stale = cached.imageData;
    }
  } catch {
    // DB unavailable — render on the fly
  }

  // Stale row: replace it with a full render when we can, otherwise keep
  // serving the old bytes short-TTL so a later request retries.
  if (stale) {
    if (isNegativelyCached(height) || liveRenders >= MAX_LIVE_RENDERS) {
      return pngResponse(stale, SHORT_CACHE, 'stale-estimated');
    }
    try {
      const { png, txCount } = await renderLive(height);
      await prisma.blockThumbnail
        .update({
          where: { blockHeight: height },
          data: { imageData: new Uint8Array(png), txCount, createdAt: new Date() },
        })
        .catch(() => {}); // the render is still good to serve
      return pngResponse(png, longCache(epoch), 'live');
    } catch {
      negativeCache.set(height, Date.now() + NEGATIVE_TTL_MS);
      return pngResponse(stale, SHORT_CACHE, 'stale-estimated');
    }
  }

  // Recently-failed height: serve a deterministic estimated skeleton without
  // hitting mempool, and let the client retry after the negative window expires.
  if (isNegativelyCached(height)) {
    return pngResponse(renderBitmapThumbnail(estimateTxs(height), 256), SHORT_CACHE, 'estimated');
  }

  // Generate. Only a render where every tx came from mempool is persisted.
  try {
    const { png, txCount } = await renderLive(height);
    await prisma.blockThumbnail
      .create({
        data: {
          blockHeight: height,
          imageData: new Uint8Array(png),
          txCount,
          epoch,
        },
      })
      .catch(() => {}); // the render is still good to serve
    return pngResponse(png, longCache(epoch), 'live');
  } catch {
    // Live fetch failed — negative-cache the height and serve an estimated
    // skeleton so the map tile is populated (and we stop hammering mempool).
    negativeCache.set(height, Date.now() + NEGATIVE_TTL_MS);
    return pngResponse(renderBitmapThumbnail(estimateTxs(height), 256), SHORT_CACHE, 'estimated');
  }
}
