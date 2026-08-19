import { NextRequest, NextResponse } from 'next/server';
import { renderBitmapThumbnail, TxInput } from '@/lib/bitmap-renderer';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

function getEpoch(height: number): number {
  return Math.floor(height / 210000) + 1;
}

// Short-lived negative cache: heights whose live fetch failed (mempool down /
// rate-limited / not-yet-mined). Avoids re-running the slow sequential mempool
// fetches on every request for the same height during the window.
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

async function fetchBlockTxs(height: number): Promise<TxInput[]> {
  const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!hashRes.ok) throw new Error('Failed to fetch block hash');
  const hash = await hashRes.text();

  const blockRes = await fetch(`https://mempool.space/api/block/${hash}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!blockRes.ok) throw new Error('Failed to fetch block info');
  const block = await blockRes.json();

  const txsRes = await fetch(`https://mempool.space/api/block/${hash}/txs/0`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!txsRes.ok) throw new Error('Failed to fetch txs');
  const txsData = await txsRes.json();

  interface RawMempoolTx {
    weight?: number;
    size?: number;
    fee?: number;
  }

  const realTxs: TxInput[] = txsData.map((tx: RawMempoolTx) => ({
    vbytes: tx.weight ? Math.ceil(tx.weight / 4) : tx.size || 250,
  }));

  const totalTx = block.tx_count;
  if (realTxs.length < totalTx) {
    // Estimate remaining txs
    const fetchedWeight = txsData.reduce((s: number, tx: RawMempoolTx) => s + (tx.weight || (tx.size || 250) * 4), 0);
    const remainingWeight = Math.max(0, (block.weight || block.size * 4) - fetchedWeight);
    const remaining = totalTx - realTxs.length;
    const avgWeight = remaining > 0 ? remainingWeight / remaining : 1000;

    // Use seeded pseudo-random variation based on height
    let seed = height;
    for (let i = 0; i < remaining; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const variation = 0.5 + (seed % 1000) / 1000; // 0.5–1.5x
      const w = Math.max(400, Math.round(avgWeight * variation));
      realTxs.push({ vbytes: Math.ceil(w / 4) });
    }
  }

  return realTxs;
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

  // Check cache
  try {
    const cached = await prisma.blockThumbnail.findUnique({
      where: { blockHeight: height },
    });
    if (cached) {
      const maxAge = epoch <= 4 ? 31536000 : 86400;
      return new NextResponse(new Uint8Array(cached.imageData), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': `public, max-age=${maxAge}${epoch <= 4 ? ', immutable' : ''}`,
        },
      });
    }
  } catch {
    // DB unavailable — render on the fly
  }

  // Recently-failed height: serve a deterministic estimated skeleton without
  // hitting mempool, and let the client retry after the negative window expires.
  if (isNegativelyCached(height)) {
    const png = renderBitmapThumbnail(estimateTxs(height), 256);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Short TTL so a later real render replaces this estimate.
        'Cache-Control': 'public, max-age=60',
        'X-Thumbnail-Source': 'estimated',
      },
    });
  }

  // Generate
  try {
    const txs = await fetchBlockTxs(height);
    const png = renderBitmapThumbnail(txs, 256);

    // Save to DB (fire and forget)
    prisma.blockThumbnail
      .create({
        data: {
          blockHeight: height,
          imageData: new Uint8Array(png),
          txCount: txs.length,
          epoch,
        },
      })
      .catch(() => {}); // don't block response

    const maxAge = epoch <= 4 ? 31536000 : 86400;
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${maxAge}${epoch <= 4 ? ', immutable' : ''}`,
        'X-Thumbnail-Source': 'live',
      },
    });
  } catch {
    // Live fetch failed — negative-cache the height and serve an estimated
    // skeleton so the map tile is populated (and we stop hammering mempool).
    negativeCache.set(height, Date.now() + NEGATIVE_TTL_MS);
    const png = renderBitmapThumbnail(estimateTxs(height), 256);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
        'X-Thumbnail-Source': 'estimated',
      },
    });
  }
}
