/**
 * Block Genomics — Bitmap Resolver (engine)
 *
 * Resolves the N.bitmap deeds an address holds, from the same chain-truth
 * sources the app uses:
 *
 *   1. **Esplora** (mempool.space, blockstream.info fallback) lists the
 *      address's current UTXOs.
 *   2. **ord recursion** on ordinals.com (`/r/utxo`, `/r/inscription`,
 *      `/content`) names the inscriptions on each UTXO and their bodies.
 *   3. **packages/bitmap-resolver** decides which inscription is the deed for
 *      each height (first-is-valid), so a later copy of "840000.bitmap" is
 *      reported in `excluded`, never as a bitmap.
 *
 * This replaced the Hiro Ordinals API (shut down on 2026-03-09, now HTTP 410;
 * issue #211) and the ord.io API (its host no longer resolves). Both were
 * read-only indexers; nothing here signs or spends.
 *
 * Fails closed: if any source is unreachable the call throws, because a short
 * list would read as "does not hold".
 *
 * @module bitmap-resolver
 */

import {
  DEFAULT_LIMITS,
  DEFAULT_ORD_ORIGIN,
  Limiter,
  OrdClient,
  SourceUnavailableError,
  defaultLimiter,
  holderOf,
  resolve,
  type ClientOptions,
} from '../packages/bitmap-resolver/src/index.js';
import type { Bitmap, BitmapResolutionResult, ExcludedBitmap, OwnershipVerification } from './types';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const BITMAP_PATTERN = /^\d+\.bitmap$/;

/** Same order as the app's lib/onchain/esplora.ts. */
const ESPLORA_ORIGINS = ['https://mempool.space/api', 'https://blockstream.info/api'];

/** A bitmap body is "<height>.bitmap"; anything longer is not one. */
const MAX_BITMAP_BYTES = 64;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/**
 * Validate and parse a bitmap content string.
 *
 * @returns The block height if valid, or null.
 */
function parseBitmapContent(content: string): number | null {
  const trimmed = content.trim();
  if (!BITMAP_PATTERN.test(trimmed)) return null;
  const height = parseInt(trimmed.replace('.bitmap', ''), 10);
  return Number.isSafeInteger(height) && height >= 0 ? height : null;
}

function limiterFor(opts: ClientOptions): Limiter {
  if (opts.limiter) return opts.limiter;
  if (opts.fetch) return new Limiter({ ...DEFAULT_LIMITS, fetch: opts.fetch });
  return defaultLimiter();
}

async function getJson(limiter: Limiter, url: string, signal?: AbortSignal): Promise<unknown> {
  let res;
  try {
    res = await limiter.get(url, { accept: 'application/json', signal });
  } catch (e) {
    throw new SourceUnavailableError(new URL(url).host, url, `unreachable: ${(e as Error).message}`);
  }
  if (res.status !== 200) throw new SourceUnavailableError(new URL(url).host, url, `HTTP ${res.status}`);
  try {
    return JSON.parse(new TextDecoder().decode(res.bytes));
  } catch {
    throw new SourceUnavailableError(new URL(url).host, url, 'invalid JSON');
  }
}

/** `<txid>:<vout>` for every output the address holds; first Esplora that answers wins. */
async function addressOutpoints(limiter: Limiter, address: string, signal?: AbortSignal): Promise<string[]> {
  const failures: string[] = [];
  for (const origin of ESPLORA_ORIGINS) {
    try {
      const data = await getJson(limiter, `${origin}/address/${encodeURIComponent(address)}/utxo`, signal);
      if (!Array.isArray(data)) throw new Error('not an array');
      return data
        .filter((u): u is { txid: string; vout: number } => typeof u?.txid === 'string' && Number.isInteger(u?.vout))
        .map((u) => `${u.txid}:${u.vout}`);
    } catch (e) {
      if (signal?.aborted) throw e;
      failures.push(`${origin}: ${(e as Error).message}`);
    }
  }
  throw new SourceUnavailableError('esplora', ESPLORA_ORIGINS[0], `no Esplora answered: ${failures.join('; ')}`);
}

/** Inscription ids on one output, via ord's recursive `/r/utxo/<outpoint>`. */
async function inscriptionsOn(limiter: Limiter, outpoint: string, signal?: AbortSignal): Promise<string[]> {
  const data = (await getJson(limiter, `${DEFAULT_ORD_ORIGIN}/r/utxo/${outpoint}`, signal)) as { inscriptions?: unknown };
  if (!Array.isArray(data?.inscriptions)) {
    throw new SourceUnavailableError('ord', `${DEFAULT_ORD_ORIGIN}/r/utxo/${outpoint}`, 'missing inscriptions[]');
  }
  return data.inscriptions.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

// ────────────────────────────────────────────
// Core API
// ────────────────────────────────────────────

/**
 * Resolve the N.bitmap deeds an address currently holds.
 *
 * @param address - A Bitcoin address (taproot / segwit / legacy).
 * @param opts    - Optional fetch / limiter / signal (tests, shared budgets).
 * @returns The deeds, plus any held N.bitmap copies that are not the deed.
 * @throws SourceUnavailableError when Esplora or ord does not answer.
 *
 * @example
 * ```ts
 * const result = await resolveBitmap('bc1p…');
 * console.log(result.bitmaps.map(b => b.content));
 * // → ["840000.bitmap", "210000.bitmap"]
 * ```
 */
export async function resolveBitmap(address: string, opts: ClientOptions = {}): Promise<BitmapResolutionResult> {
  const limiter = limiterFor(opts);
  const ord = new OrdClient(limiter);
  const { signal } = opts;

  const outpoints = await addressOutpoints(limiter, address, signal);
  const ids = [...new Set((await Promise.all(outpoints.map((op) => inscriptionsOn(limiter, op, signal)))).flat())];

  const bitmaps: Bitmap[] = [];
  const excluded: ExcludedBitmap[] = [];

  for (const id of ids) {
    const ins = await ord.inscription(id, signal);
    if (!ins) continue;
    const type = ins.content_type;
    if (type && !type.startsWith('text/plain') && !type.startsWith('text/html')) continue;

    const bytes = await ord.content(id, signal);
    if (!bytes || bytes.length > MAX_BITMAP_BYTES) continue;
    const text = new TextDecoder().decode(bytes);
    const blockHeight = parseBitmapContent(text);
    if (blockHeight === null) continue;

    // First-is-valid: only the deed for this height counts.
    const deed = await resolve(blockHeight, { ...opts, limiter, freshness: 'display' });
    if (deed.verdict === 'canonical' && deed.canonicalId === id) {
      bitmaps.push({
        inscriptionId: id,
        number: ins.number,
        content: text.trim(),
        blockHeight,
        owner: address,
        contentType: type,
        revealHeight: ins.height,
      });
    } else {
      excluded.push({
        inscriptionId: id,
        blockHeight,
        verdict: deed.verdict,
        reason:
          deed.verdict === 'canonical'
            ? `not the deed: ${deed.canonicalId} is ${blockHeight}.bitmap`
            : (deed.reason ?? `resolver verdict ${deed.verdict}`),
      });
    }
  }

  return { address, bitmaps, excluded, source: 'ord', resolvedAt: Date.now() };
}

/**
 * Verify that a specific inscription is currently held by an address.
 *
 * Uses the resolver's live-holder check: ord and Esplora must agree the
 * holding output is unspent and pays the address. Anything else is not owned.
 *
 * @param inscriptionId - The inscription ID to check.
 * @param address       - The address to verify against.
 * @returns Ownership verification result.
 */
export async function verifyBitmapOwnership(
  inscriptionId: string,
  address: string,
  opts: ClientOptions = {},
): Promise<OwnershipVerification> {
  const holder = await holderOf(inscriptionId, 'auth', { ...opts, limiter: limiterFor(opts) });
  return {
    inscriptionId,
    address,
    isOwner: holder?.address === address,
    holder: holder?.address ?? null,
    checkedAt: Date.now(),
    source: 'ord+esplora',
    ...(holder ? {} : { reason: 'ord and Esplora did not agree on a live holder' }),
  };
}

/** Exported for testing. */
export const _testHelpers = {
  parseBitmapContent,
  BITMAP_PATTERN,
  ESPLORA_ORIGINS,
};
