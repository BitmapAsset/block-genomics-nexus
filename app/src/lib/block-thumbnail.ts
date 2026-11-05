/**
 * A block's bitmap art PNG: cached row, full live render, or a deterministic
 * estimate, plus the Cache-Control that answer deserves.
 *
 * `GET /api/v1/block-thumbnail/[height]` serves it over HTTP, and the OG share
 * card calls it in-process. The card used to fetch the route at the origin of
 * the request it was answering, which put the caller's Host header in charge
 * of which server the card's renderer requested (CodeQL js/request-forgery).
 */

import { renderBitmapThumbnail } from '@/lib/bitmap-renderer';
import { completeSatTotals, estimatedSquareSize, logTxSize, txSatsToSizes } from '@/lib/bitmap-layout';
import { prisma } from '@/lib/prisma';
import { getBlockSummary } from '@/lib/block-summary';

/** How the PNG was produced; the route sends it as `X-Thumbnail-Source`. */
export type ThumbnailSource = 'cache' | 'live' | 'stale-estimated' | 'estimated';

export interface BlockThumbnail {
  png: Uint8Array;
  cacheControl: string;
  source: ThumbnailSource;
}

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
 * Rows written before this instant are not the Bitmap picture: until 2026-10-16
 * they were the first 25 transactions plus a height-seeded estimate, and until
 * the value-layout fix every row sized its squares by vbytes. They are refreshed
 * in place on their next request (see getBlockThumbnail). No bulk purge and no
 * migration: a row stays servable until a full live render replaces it. Set to
 * the deploy time at ship, so no row the old code wrote after it survives.
 * Set at the 2026-11-05 layout deploy: rows created before this were drawn with the byte-sized rule.
 */
const THUMBNAIL_REAL_ART_SINCE = new Date('2026-11-05T09:46:00Z');

/**
 * Live re-renders of stale rows in flight on this instance. The Nexus canvas
 * asks for hundreds of tiles at once and every one is a stale row right after
 * deploy; past the cap the old bytes are served short-TTL and retried later,
 * so a page load cannot herd mempool. Cache-miss renders count toward the
 * total but are not gated (there are no old bytes to fall back on).
 */
const MAX_LIVE_RENDERS = 4;
let liveRenders = 0;

/**
 * Every transaction's square side, from its real output total in the shared
 * block summary fetch (lib/block-summary). A failed or incomplete summary, or
 * one missing a single output total, throws: the caller falls back to an
 * estimate and persists nothing.
 */
async function fetchBlockSizes(height: number): Promise<number[]> {
  const { value } = await getBlockSummary(height);
  const sats = completeSatTotals(value);
  if (!sats) throw new Error('Block summary tx without an output total');
  return txSatsToSizes(sats);
}

/**
 * Pixel size of the art: the Bitmap community's 576 × 576 (Magic Eden, ordinals-wallet).
 * The drawing rule rounds the half-cell gap to whole pixels, so a smaller render
 * of a big block reads heavier than the canonical image; browsers downscale this one.
 */
const THUMBNAIL_PX = 576;

/** Full live render, counted against the in-flight cap. */
async function renderLive(height: number): Promise<{ png: Buffer; txCount: number }> {
  liveRenders++;
  try {
    const sizes = await fetchBlockSizes(height);
    return { png: renderBitmapThumbnail(sizes, THUMBNAIL_PX), txCount: sizes.length };
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

/**
 * Deterministic estimated square sides seeded purely by height — no network.
 * Used when the live block is unreachable (negative-cached) so the tile still
 * renders a Mondrian skeleton instead of erroring. The coinbase gets the
 * subsidy's square (it pays at least that); the rest come from the value
 * distribution. Estimates only; served as `estimated` and NOT persisted to the
 * DB cache (which holds real/live-derived thumbnails).
 */
function estimateSizes(height: number): number[] {
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

  const subsidySats = Math.floor(5_000_000_000 / 2 ** Math.floor(height / 210000));
  const sizes: number[] = [logTxSize(subsidySats)];
  for (let i = 1; i < count; i++) sizes.push(estimatedSquareSize(rng()));
  return sizes;
}

/** The art for a validated, non-negative block height. */
export async function getBlockThumbnail(height: number): Promise<BlockThumbnail> {
  const epoch = getEpoch(height);

  // Check cache. Rows from before THUMBNAIL_REAL_ART_SINCE hold estimated art.
  let stale: Uint8Array | null = null;
  try {
    const cached = await prisma.blockThumbnail.findUnique({
      where: { blockHeight: height },
    });
    if (cached) {
      if (cached.createdAt >= THUMBNAIL_REAL_ART_SINCE) {
        return { png: cached.imageData, cacheControl: longCache(epoch), source: 'cache' };
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
      return { png: stale, cacheControl: SHORT_CACHE, source: 'stale-estimated' };
    }
    try {
      const { png, txCount } = await renderLive(height);
      await prisma.blockThumbnail
        .update({
          where: { blockHeight: height },
          data: { imageData: new Uint8Array(png), txCount, createdAt: new Date() },
        })
        .catch(() => {}); // the render is still good to serve
      return { png, cacheControl: longCache(epoch), source: 'live' };
    } catch {
      negativeCache.set(height, Date.now() + NEGATIVE_TTL_MS);
      return { png: stale, cacheControl: SHORT_CACHE, source: 'stale-estimated' };
    }
  }

  // Recently-failed height: serve a deterministic estimated skeleton without
  // hitting mempool, and let the client retry after the negative window expires.
  if (isNegativelyCached(height)) {
    return { png: renderBitmapThumbnail(estimateSizes(height), THUMBNAIL_PX), cacheControl: SHORT_CACHE, source: 'estimated' };
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
    return { png, cacheControl: longCache(epoch), source: 'live' };
  } catch {
    // Live fetch failed — negative-cache the height and serve an estimated
    // skeleton so the map tile is populated (and we stop hammering mempool).
    negativeCache.set(height, Date.now() + NEGATIVE_TTL_MS);
    return { png: renderBitmapThumbnail(estimateSizes(height), THUMBNAIL_PX), cacheControl: SHORT_CACHE, source: 'estimated' };
  }
}
