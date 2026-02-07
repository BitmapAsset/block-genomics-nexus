/**
 * Block Genomics — Bitcoin Blockchain Service
 *
 * Fetches block data from mempool.space and verifies Bitmap inscriptions
 * via Hiro's Ordinals API. All external calls include timeouts, retries,
 * caching, and rate-limit awareness.
 *
 * @module blockchain
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw block object returned by mempool.space `/block/:hash`. */
export interface MempoolBlock {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
  merkle_root: string;
  previousblockhash: string;
  nonce: number;
  bits: number;
  difficulty: number;
  mediantime: number;
}

/** Slim transaction shape we keep from mempool.space. */
export interface MempoolTransaction {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey: string;
      scriptpubkey_type: string;
      value: number;
    } | null;
    scriptsig: string;
    sequence: number;
    witness?: string[];
    is_coinbase: boolean;
  }>;
  vout: Array<{
    scriptpubkey: string;
    scriptpubkey_type: string;
    scriptpubkey_address?: string;
    value: number;
  }>;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
}

/** Result of a Bitmap inscription ownership check. */
export interface BitmapVerification {
  owned: boolean;
  inscriptionId: string | null;
  inscriptionNumber: number | null;
  blockHeight: number;
  address: string;
  checkedAt: string;
}

/** Typed error for blockchain operations. */
export class BlockchainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BLOCK_NOT_FOUND"
      | "API_ERROR"
      | "RATE_LIMITED"
      | "TIMEOUT"
      | "INVALID_INPUT",
    public readonly statusCode: number = 500,
    public readonly upstream?: unknown,
  ) {
    super(message);
    this.name = "BlockchainError";
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MEMPOOL_API = process.env.MEMPOOL_API_URL ?? "https://mempool.space/api";
const HIRO_API = process.env.HIRO_API_URL ?? "https://api.hiro.so/ordinals/v1";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1_000; // exponential: 1s, 2s, 4s

// ---------------------------------------------------------------------------
// In-memory cache (LRU-ish, bounded)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function cacheSet<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void {
  // Evict oldest entries when limit reached
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------------------------------
// Rate limiter (token bucket per upstream host)
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

const buckets: Record<string, Bucket> = {
  mempool: { tokens: 10, lastRefill: Date.now(), maxTokens: 10, refillRate: 5 },
  hiro: { tokens: 10, lastRefill: Date.now(), maxTokens: 10, refillRate: 3 },
};

function consumeToken(bucketName: string): boolean {
  const b = buckets[bucketName];
  if (!b) return true;
  const now = Date.now();
  const elapsed = (now - b.lastRefill) / 1_000;
  b.tokens = Math.min(b.maxTokens, b.tokens + elapsed * b.refillRate);
  b.lastRefill = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ---------------------------------------------------------------------------
// Fetch helper with timeout + retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  bucketName: string,
  retries: number = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (!consumeToken(bucketName)) {
      throw new BlockchainError(
        `Rate limit reached for ${bucketName}`,
        "RATE_LIMITED",
        429,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const resp = await fetch(url, { signal: controller.signal });

      if (resp.status === 429) {
        clearTimeout(timer);
        if (attempt < retries) {
          await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new BlockchainError(
          `Upstream rate limit (429) from ${bucketName}`,
          "RATE_LIMITED",
          429,
        );
      }

      if (!resp.ok && attempt < retries && resp.status >= 500) {
        clearTimeout(timer);
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }

      clearTimeout(timer);
      return resp;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof BlockchainError) throw err;
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        if (attempt < retries) {
          await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new BlockchainError("Request timed out", "TIMEOUT", 504, err);
      }
      if (attempt < retries) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw new BlockchainError(
        `Fetch failed: ${(err as Error).message}`,
        "API_ERROR",
        502,
        err,
      );
    }
  }
  // Unreachable, but TS wants it
  throw new BlockchainError("Max retries exceeded", "API_ERROR", 502);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a Bitcoin block by height.
 *
 * 1. Resolves `height → blockHash` via mempool.space.
 * 2. Fetches full block header/metadata.
 *
 * Results are cached for 5 minutes (immutable data — could be longer, but
 * we keep it moderate to cap memory).
 *
 * @param height - The Bitcoin block height (>= 0).
 * @returns The block data from mempool.space.
 * @throws {BlockchainError} On invalid input, not-found, or upstream failure.
 */
export async function fetchBlock(height: number): Promise<MempoolBlock> {
  if (!Number.isInteger(height) || height < 0) {
    throw new BlockchainError(
      `Invalid block height: ${height}`,
      "INVALID_INPUT",
      400,
    );
  }

  const cacheKey = `block:${height}`;
  const cached = cacheGet<MempoolBlock>(cacheKey);
  if (cached) return cached;

  // Step 1: height → hash
  const hashResp = await fetchWithRetry(
    `${MEMPOOL_API}/block-height/${height}`,
    "mempool",
  );
  if (hashResp.status === 404) {
    throw new BlockchainError(
      `Block at height ${height} not found`,
      "BLOCK_NOT_FOUND",
      404,
    );
  }
  const blockHash = await hashResp.text();
  if (!blockHash || blockHash.length !== 64) {
    throw new BlockchainError(
      `Invalid block hash returned for height ${height}`,
      "API_ERROR",
      502,
    );
  }

  // Step 2: hash → full block
  const blockResp = await fetchWithRetry(
    `${MEMPOOL_API}/block/${blockHash}`,
    "mempool",
  );
  if (!blockResp.ok) {
    throw new BlockchainError(
      `Failed to fetch block ${blockHash}`,
      "API_ERROR",
      blockResp.status,
    );
  }
  const block = (await blockResp.json()) as MempoolBlock;

  cacheSet(cacheKey, block, 10 * 60 * 1_000); // 10 min — block data is immutable
  return block;
}

/**
 * Fetch transactions for a block, paginated from mempool.space.
 *
 * Returns up to `maxPages * 25` transactions (mempool.space returns 25/page).
 *
 * @param blockHash - The 64-char hex block hash.
 * @param maxPages  - Maximum number of 25-tx pages to fetch (default 8 → 200 txs).
 * @returns Array of transactions.
 * @throws {BlockchainError}
 */
export async function fetchTransactions(
  blockHash: string,
  maxPages: number = 8,
): Promise<MempoolTransaction[]> {
  if (!/^[0-9a-f]{64}$/i.test(blockHash)) {
    throw new BlockchainError(
      "Invalid block hash format",
      "INVALID_INPUT",
      400,
    );
  }

  const cacheKey = `txs:${blockHash}:${maxPages}`;
  const cached = cacheGet<MempoolTransaction[]>(cacheKey);
  if (cached) return cached;

  const transactions: MempoolTransaction[] = [];

  for (let page = 0; page < maxPages; page++) {
    const resp = await fetchWithRetry(
      `${MEMPOOL_API}/block/${blockHash}/txs/${page * 25}`,
      "mempool",
    );
    if (!resp.ok) break;

    const txs = (await resp.json()) as MempoolTransaction[];
    if (!txs || txs.length === 0) break;
    transactions.push(...txs);
  }

  cacheSet(cacheKey, transactions, 10 * 60 * 1_000);
  return transactions;
}

/**
 * Verify whether a given address owns the Bitmap inscription for a block height.
 *
 * Queries the Hiro Ordinals API for text/plain inscriptions held by `address`,
 * then checks whether any of them is `"{blockHeight}.bitmap"`.
 *
 * @param address     - Bitcoin address to check.
 * @param blockHeight - The block height whose Bitmap we're looking for.
 * @returns Verification result.
 * @throws {BlockchainError}
 */
export async function verifyBitmapInscription(
  address: string,
  blockHeight: number,
): Promise<BitmapVerification> {
  if (!address || typeof address !== "string" || address.length < 20) {
    throw new BlockchainError(
      "Invalid Bitcoin address",
      "INVALID_INPUT",
      400,
    );
  }
  if (!Number.isInteger(blockHeight) || blockHeight < 0) {
    throw new BlockchainError(
      "Invalid block height",
      "INVALID_INPUT",
      400,
    );
  }

  const cacheKey = `bitmap:${address}:${blockHeight}`;
  const cached = cacheGet<BitmapVerification>(cacheKey);
  if (cached) return cached;

  const target = `${blockHeight}.bitmap`;
  let offset = 0;
  const limit = 60;

  while (offset < 500) {
    const url =
      `${HIRO_API}/inscriptions?address=${encodeURIComponent(address)}` +
      `&mime_type=text/plain&limit=${limit}&offset=${offset}`;

    const resp = await fetchWithRetry(url, "hiro");
    if (!resp.ok) break;

    const data = (await resp.json()) as {
      results: Array<{
        id: string;
        number: number;
        content_length: number;
        mime_type: string;
      }>;
      total: number;
    };

    if (!data.results || data.results.length === 0) break;

    // Check each inscription's content
    for (const insc of data.results) {
      if (insc.content_length > 100) continue; // bitmap content is tiny

      const contentResp = await fetchWithRetry(
        `${HIRO_API}/inscriptions/${insc.id}/content`,
        "hiro",
      );
      if (!contentResp.ok) continue;

      const content = await contentResp.text();
      if (content.trim() === target) {
        const result: BitmapVerification = {
          owned: true,
          inscriptionId: insc.id,
          inscriptionNumber: insc.number,
          blockHeight,
          address,
          checkedAt: new Date().toISOString(),
        };
        cacheSet(cacheKey, result, 2 * 60 * 1_000); // 2 min — ownership can transfer
        return result;
      }
    }

    offset += data.results.length;
    if (offset >= data.total) break;
  }

  const result: BitmapVerification = {
    owned: false,
    inscriptionId: null,
    inscriptionNumber: null,
    blockHeight,
    address,
    checkedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, result, 60 * 1_000); // 1 min — negative results expire faster
  return result;
}

/**
 * Convenience: fetch a block + its transactions in a single call.
 *
 * @param height   - Block height.
 * @param maxTxPages - Max transaction pages to fetch.
 * @returns `{ block, transactions }`
 */
export async function fetchBlockWithTransactions(
  height: number,
  maxTxPages: number = 8,
): Promise<{ block: MempoolBlock; transactions: MempoolTransaction[] }> {
  const block = await fetchBlock(height);
  const transactions = await fetchTransactions(block.id, maxTxPages);
  return { block, transactions };
}
