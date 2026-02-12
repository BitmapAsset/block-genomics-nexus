/**
 * Real Bitcoin blockchain data fetcher
 * Primary: mempool.space API (same as Bitfeed). Fallback: blockchain.info
 * Caches results in memory to avoid repeated fetches
 */

export interface RealTx {
  txIndex: number;    // position in block (0 = coinbase)
  size: number;       // bytes (vbytes for pre-segwit)
  weight: number;     // weight units
  fee: number;        // satoshis
  isCoinbase: boolean;
}

export interface RealBlockData {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;       // total block size bytes
  weight: number;     // total weight units
  txs: RealTx[];      // all transactions with sizes
}

// In-memory cache
const blockCache = new Map<number, RealBlockData>();

/** Fetch from mempool.space API (primary — same source as Bitfeed) */
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

    // Get transactions (first page, up to 25)
    const txsRes = await fetch(`https://mempool.space/api/block/${hash}/txs/0`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!txsRes.ok) return null;
    const txsData = await txsRes.json();

    // For blocks with >25 txs, fetch remaining pages (cap at 200 pages = 5000 txs to avoid hanging)
    const allTxs: any[] = [...txsData];
    const totalTx = block.tx_count;
    const maxTxs = 5000; // cap to prevent 120+ sequential fetches on huge blocks
    let startIndex = 25;
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
        break; // don't let one failed page kill the whole fetch
      }
    }

    const txs: RealTx[] = allTxs.map((tx: any, i: number) => ({
      txIndex: i,
      size: tx.weight ? Math.ceil(tx.weight / 4) : tx.size || 250, // vbytes
      weight: tx.weight || (tx.size || 250) * 4,
      fee: tx.fee || 0,
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

    const txs: RealTx[] = (block.tx || []).map((tx: any, i: number) => ({
      txIndex: i,
      size: tx.size || 250,
      weight: tx.weight || tx.size * 4,
      fee: tx.fee || 0,
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
