/**
 * Real Bitcoin blockchain data fetcher
 * Primary: mempool.space API (same as Bitfeed). Fallback: blockchain.info
 * Caches results in memory to avoid repeated fetches
 */

export interface RealTx {
  txIndex: number;    // position in block (0 = coinbase)
  size: number;       // bytes (vbytes for pre-segwit)
  weight: number;     // weight units
  /**
   * Satoshis paid, or null when this transaction was synthesized to fill a page
   * that was never fetched. Null is the honest answer: the block's real total
   * weight constrains a synthesized SIZE, but nothing at all constrains its
   * fee, so there is no number here that is derived from anything.
   */
  fee: number | null;
  isCoinbase: boolean;
  /** True when this transaction's figures are synthesized rather than fetched. */
  estimated?: boolean;
}

export interface RealBlockData {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;       // total block size bytes
  weight: number;     // total weight units
  txs: RealTx[];      // all transactions with sizes
  estimated?: boolean; // true if most tx sizes are estimated (not fetched)
}

/** Raw transaction shape from mempool.space / blockchain.info APIs */
interface RawApiTx {
  weight?: number;
  size?: number;
  fee?: number;
}

// In-memory cache
const blockCache = new Map<number, RealBlockData>();

/**
 * Fill the pages we did not fetch with size-only placeholders.
 *
 * A block summary gives a real total weight, and the first page gives real
 * transactions; the remainder is drawn from a size distribution and rescaled so
 * the synthesized weights sum to the weight actually left over. That makes the
 * SIZES a defensible approximation of something measured, and each one is
 * flagged `estimated` so no caller can mistake it for a fetched value.
 *
 * The fee had none of that. It was `rng() * 50000` sats — an invented number
 * with nothing behind it, on a payload named "Real"; ParcelView turned it into
 * a building height and a "₿ VALUE" readout. It is `null` now. Not knowing is
 * representable; guessing and calling it real is not.
 */
function generateEstimatedTxs(
  startIndex: number,
  totalTxCount: number,
  remainingWeight: number,
  blockHeight: number,
): RealTx[] {
  const count = totalTxCount - startIndex;
  if (count <= 0) return [];

  // Seeded PRNG for deterministic results
  let seed = blockHeight * 7919 + startIndex * 1303;
  const rng = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Generate raw weights using realistic distribution
  const rawWeights: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = rng();
    let w: number;
    if (u < 0.60) {
      w = (140 + rng() * 116) * 4; // small tx: 140-256 vbytes
    } else if (u < 0.85) {
      w = (257 + rng() * 543) * 4; // medium: 257-800
    } else if (u < 0.95) {
      w = (801 + rng() * 2199) * 4; // large: 801-3000
    } else if (u < 0.99) {
      w = (3001 + rng() * 12000) * 4; // very large
    } else {
      w = (15001 + rng() * 50000) * 4; // rare huge
    }
    rawWeights.push(w);
  }

  // Scale to match remaining weight
  const rawTotal = rawWeights.reduce((s, w) => s + w, 0);
  const scale = rawTotal > 0 ? remainingWeight / rawTotal : 1;

  return rawWeights.map((w, i) => {
    const weight = Math.max(400, Math.round(w * scale)); // min 100 vbytes
    return {
      txIndex: startIndex + i,
      size: Math.ceil(weight / 4),
      weight,
      fee: null,
      isCoinbase: false,
      estimated: true,
    };
  });
}

/** Fetch from mempool.space API — fast mode: summary + first page only, estimate rest */
async function fetchFromMempool(height: number): Promise<RealBlockData | null> {
  try {
    // Get block hash
    const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!hashRes.ok) return null;
    const hash = await hashRes.text();

    // Get block info
    const blockRes = await fetch(`https://mempool.space/api/block/${hash}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!blockRes.ok) return null;
    const block = await blockRes.json();

    // Get ONLY first page of transactions (up to 25)
    const txsRes = await fetch(`https://mempool.space/api/block/${hash}/txs/0`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!txsRes.ok) return null;
    const txsData = await txsRes.json();

    // Map real first-page txs
    const realTxs: RealTx[] = txsData.map((tx: RawApiTx, i: number) => ({
      txIndex: i,
      size: tx.weight ? Math.ceil(tx.weight / 4) : tx.size || 250,
      weight: tx.weight || (tx.size || 250) * 4,
      // `?? null`, not `|| 0`: a missing fee field is unknown, and a real
      // zero-fee transaction is a fact. Collapsing both to 0 loses that.
      fee: tx.fee ?? null,
      isCoinbase: i === 0,
    }));

    const totalTx = block.tx_count;
    const isEstimated = realTxs.length < totalTx;

    let allTxs: RealTx[];
    if (isEstimated) {
      // Calculate remaining weight and generate estimates
      const fetchedWeight = realTxs.reduce((s, t) => s + t.weight, 0);
      const remainingWeight = Math.max(0, (block.weight || block.size * 4) - fetchedWeight);
      const estimatedTxs = generateEstimatedTxs(realTxs.length, totalTx, remainingWeight, height);
      allTxs = [...realTxs, ...estimatedTxs];
    } else {
      allTxs = realTxs;
    }

    return {
      height,
      hash: block.id,
      timestamp: block.timestamp,
      txCount: block.tx_count,
      size: block.size,
      weight: block.weight,
      txs: allTxs,
      estimated: isEstimated,
    };
  } catch {
    return null;
  }
}

/** Fetch ALL real tx data from mempool.space (for "Load Full Data" button) */
async function fetchFullFromMempool(height: number): Promise<RealBlockData | null> {
  try {
    const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!hashRes.ok) return null;
    const hash = await hashRes.text();

    const blockRes = await fetch(`https://mempool.space/api/block/${hash}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!blockRes.ok) return null;
    const block = await blockRes.json();

    const allTxs: RawApiTx[] = [];
    const totalTx = block.tx_count;
    const maxTxs = 5000;
    let startIndex = 0;
    while (allTxs.length < totalTx && allTxs.length < maxTxs && startIndex < totalTx) {
      try {
        const pageRes = await fetch(`https://mempool.space/api/block/${hash}/txs/${startIndex}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!pageRes.ok) break;
        const page = await pageRes.json();
        if (page.length === 0) break;
        allTxs.push(...page);
        startIndex += 25;
      } catch {
        break;
      }
    }

    const txs: RealTx[] = allTxs.map((tx: RawApiTx, i: number) => ({
      txIndex: i,
      size: tx.weight ? Math.ceil(tx.weight / 4) : tx.size || 250,
      weight: tx.weight || (tx.size || 250) * 4,
      // `?? null`, not `|| 0`: a missing fee field is unknown, and a real
      // zero-fee transaction is a fact. Collapsing both to 0 loses that.
      fee: tx.fee ?? null,
      isCoinbase: i === 0,
    }));

    return {
      height,
      hash: block.id,
      timestamp: block.timestamp,
      txCount: block.tx_count,
      size: block.size,
      weight: block.weight,
      txs,
      // The page walk stops at `maxTxs`, and a block can carry more than that.
      // A short read is still a partial view, so it reports as estimated rather
      // than lighting the "🟢 Live" badge over a block it only half-fetched.
      estimated: txs.length < block.tx_count,
    };
  } catch {
    return null;
  }
}

/** Fallback: blockchain.info API */
async function fetchFromBlockchainInfo(height: number): Promise<RealBlockData | null> {
  try {
    const res = await fetch(`https://blockchain.info/block-height/${height}?format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const block = data.blocks?.[0];
    if (!block) return null;

    const txs: RealTx[] = (block.tx || []).map((tx: RawApiTx, i: number) => ({
      txIndex: i,
      size: tx.size || 250,
      weight: tx.weight || (tx.size || 250) * 4,
      // `?? null`, not `|| 0`: a missing fee field is unknown, and a real
      // zero-fee transaction is a fact. Collapsing both to 0 loses that.
      fee: tx.fee ?? null,
      isCoinbase: i === 0,
    }));

    return {
      height,
      hash: block.hash,
      timestamp: block.time,
      txCount: block.n_tx,
      size: block.size,
      weight: block.weight,
      txs,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch real block data (mempool.space primary, blockchain.info fallback)
 * Returns null if fetch fails (caller should fall back to mock)
 */
export async function fetchRealBlock(height: number): Promise<RealBlockData | null> {
  // Check cache first
  const cached = blockCache.get(height);
  if (cached) return cached;

  try {
    // Try mempool.space first (same API Bitfeed uses)
    let result = await fetchFromMempool(height);
    if (!result) {
      // Fallback to blockchain.info
      result = await fetchFromBlockchainInfo(height);
    }
    if (result) {
      blockCache.set(height, result);
    }
    return result;
  } catch (e) {
    console.warn(`[BlockchainAPI] Failed to fetch block ${height}:`, e);
    return null;
  }
}

/**
 * Fetch full (non-estimated) block data — all real tx sizes.
 * Use this for the "Load Real Data" button.
 */
export async function fetchFullBlock(height: number): Promise<RealBlockData | null> {
  try {
    const result = await fetchFullFromMempool(height);
    if (result) {
      blockCache.set(height, result);
    }
    return result;
  } catch (e) {
    console.warn(`[BlockchainAPI] Failed to fetch full block ${height}:`, e);
    return null;
  }
}

/** Check if block data is cached */
export function isBlockCached(height: number): boolean {
  return blockCache.has(height);
}

/** Get cached block (sync, returns null if not cached) */
export function getCachedBlock(height: number): RealBlockData | null {
  return blockCache.get(height) ?? null;
}

/** Pre-warm cache for a range of blocks */
export async function prefetchBlocks(heights: number[]): Promise<void> {
  const uncached = heights.filter(h => !blockCache.has(h));
  // Fetch in parallel, max 3 concurrent
  const batchSize = 3;
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(h => fetchRealBlock(h)));
  }
}
