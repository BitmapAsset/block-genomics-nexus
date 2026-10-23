/**
 * Every transaction of a block, from mempool's block summary, in one call.
 *
 * Shared by the bitmap thumbnail (which renders the Mondrian from `vsize`) and
 * `GET /api/v1/blocks/[height]/summary` (which the block viewer lays its parcels
 * out from), so the 2D art and the 3D district are packed from the same numbers.
 *
 * mempool's `GET /api/v1/block/{hash}/summary` returns the whole block in one
 * array (`txid`, `fee`, `vsize`, `value`, `rate`, `flags` per tx). A summary that
 * is empty, shorter than the block's `tx_count`, or has a tx without a usable
 * vsize is a failed fetch: callers fall back or fail, and nothing is cached.
 */

export interface BlockSummary {
  height: number;
  hash: string;
  txCount: number;
  size: number;
  weight: number;
  timestamp: number;
  /** Per tx, block order. mempool's vsize is weight / 4, so it can be fractional. */
  vsize: number[];
  /** Satoshis per tx, or null when mempool did not say. The coinbase pays 0. */
  fee: (number | null)[];
  /** Output total in satoshis per tx, or null when mempool did not say. */
  value: (number | null)[];
}

/** The height has no block yet (or mempool does not know one). */
export class BlockNotFoundError extends Error {
  constructor(height: number) {
    super(`No block at height ${height}`);
    this.name = 'BlockNotFoundError';
  }
}

/** One entry of mempool's summary (TransactionStripped). */
interface StrippedTx {
  vsize?: number;
  fee?: number;
  value?: number;
}

// Short-lived negative cache: heights whose fetch failed (mempool down /
// rate-limited / not yet mined), so a burst of requests for the same height
// does not re-run three mempool calls each during the window.
const NEGATIVE_TTL_MS = 60_000;
const negativeCache = new Map<number, { expiry: number; notFound: boolean }>();

// Positive cache, bounded. A 4,000-tx block is ~90 KB here, so 64 entries is a
// few MB per instance at worst. Insertion order doubles as the eviction order.
const MAX_CACHED = 64;
const cache = new Map<number, { summary: BlockSummary; at: number }>();

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function fetchSummary(height: number): Promise<BlockSummary> {
  const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (hashRes.status === 404) throw new BlockNotFoundError(height);
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
  const block = (await blockRes.json()) as { tx_count?: number; size?: number; weight?: number; timestamp?: number };
  const summary = (await summaryRes.json()) as unknown;

  if (!Array.isArray(summary) || summary.length === 0) throw new Error('Empty block summary');
  if (typeof block.tx_count !== 'number' || summary.length !== block.tx_count) {
    throw new Error('Incomplete block summary');
  }

  const txs = summary as StrippedTx[];
  const vsize = txs.map((tx) => {
    const v = tx?.vsize;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error('Block summary tx without vsize');
    }
    return v;
  });

  return {
    height,
    hash,
    txCount: block.tx_count,
    size: num(block.size) ?? 0,
    weight: num(block.weight) ?? 0,
    timestamp: num(block.timestamp) ?? 0,
    vsize,
    fee: txs.map((tx) => num(tx?.fee)),
    value: txs.map((tx) => num(tx?.value)),
  };
}

/**
 * The block at `height`, from cache when it is younger than `maxAgeMs`.
 *
 * A deep block never changes, so the default keeps it for the life of the
 * instance; callers near the tip pass a short age so a reorg is picked up.
 * Throws `BlockNotFoundError` for an unmined height and `Error` otherwise.
 */
export async function getBlockSummary(height: number, maxAgeMs = Infinity): Promise<BlockSummary> {
  const now = Date.now();
  const hit = cache.get(height);
  if (hit && now - hit.at <= maxAgeMs) return hit.summary;

  const neg = negativeCache.get(height);
  if (neg) {
    if (now <= neg.expiry) {
      if (neg.notFound) throw new BlockNotFoundError(height);
      throw new Error('Block summary recently failed');
    }
    negativeCache.delete(height);
  }

  try {
    const summary = await fetchSummary(height);
    cache.delete(height);
    cache.set(height, { summary, at: now });
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as number);
    return summary;
  } catch (e) {
    negativeCache.set(height, { expiry: now + NEGATIVE_TTL_MS, notFound: e instanceof BlockNotFoundError });
    throw e;
  }
}

// The chain tip changes every ~10 minutes; 30 s is fresh enough to decide
// whether a block has 6 confirmations.
const TIP_TTL_MS = 30_000;
let tipMemo: { height: number; at: number } | null = null;

/**
 * Every height at or below this was mined before this code shipped (the tip
 * was ~972,700 on 2026-10-22), so asking mempool about it can only say "mined".
 * Block pages skip the tip fetch for these heights and keep their latency.
 */
export const KNOWN_MINED_HEIGHT = 972_000;

/**
 * True when `height` is above the chain tip, i.e. not mined yet. An unreadable
 * tip answers false, so a mempool outage never hides a real block.
 */
export async function isAboveTip(height: number): Promise<boolean> {
  if (height <= KNOWN_MINED_HEIGHT) return false;
  const tip = await getTipHeight();
  return tip !== null && height > tip;
}

/** mempool's tip height, or null when it cannot be read right now. */
export async function getTipHeight(): Promise<number | null> {
  const now = Date.now();
  if (tipMemo && now - tipMemo.at <= TIP_TTL_MS) return tipMemo.height;
  try {
    const res = await fetch('https://mempool.space/api/blocks/tip/height', {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const tip = Number((await res.text()).trim());
    if (!Number.isSafeInteger(tip) || tip < 0) return null;
    tipMemo = { height: tip, at: now };
    return tip;
  } catch {
    return null;
  }
}
