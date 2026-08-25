/**
 * ord server JSON client
 *
 * ordinals.com is a hosted `ord` instance, so its `ord` server JSON API
 * (Accept: application/json) is the on-chain source of truth for:
 *   - inscription → current holder address + satpoint
 *   - address → inscription ids it currently holds
 *   - indexer tip height (freshness gate)
 *
 * This is the ONLY place that talks to the ord/ordinals.com server for
 * ownership facts, so the base URL and request shape live in one spot.
 *
 * SECURITY: every function FAILS CLOSED — on non-200, parse failure, or
 * network error it returns null (or an empty/unknown result). Callers MUST
 * treat null as "on-chain truth unavailable" and never grant ownership or
 * trigger a transfer on it. Do not invent a "trust on outage" path here.
 *
 * Base URL: `process.env.ORD_BASE_URL` (default `https://ordinals.com`), so
 * flipping to a self-hosted ord instance is an env change with zero code
 * change and NO new required env for deploy.
 */

import { getAddressOutpoints } from '@/lib/onchain/esplora';

export const ORD_BASE_URL = (process.env.ORD_BASE_URL || 'https://ordinals.com').replace(/\/+$/, '');

const FETCH_TIMEOUT_MS = 8000;

/** Parallel `/r/utxo` reads per wallet scan. Verified against ordinals.com: 16 at once answered 200 in ~0.6s. */
const UTXO_LOOKUP_CONCURRENCY = 8;

// Self-throttle to ~1 request/sec. ownership-sync previously enforced this
// (a ~1.1s min interval, hinting at prior 429s from ordinals.com), so we keep
// that behavior centralized here for every ord call.
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestTs = 0;

async function ordFetch(path: string, opts: { throttle?: boolean } = {}): Promise<Response> {
  if (opts.throttle !== false) {
    const now = Date.now();
    const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestTs);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestTs = Date.now();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${ORD_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run `work` over `items` at most `limit` at a time.
 *
 * Rejects as soon as any item rejects, because every caller here needs a
 * COMPLETE answer: a partial inscription list is a false negative, and a false
 * negative is what denies someone a block they own.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await work(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Types ───────────────────────────────────────────────────────

export interface InscriptionOwner {
  /** Current holder bech32 address. */
  address: string;
  /** `<txid>:<vout>:<offset>` of the UTXO currently holding the inscription. */
  satpoint: string;
}

export interface OrdStatus {
  height: number;
}

// ─── Inscription → current holder ────────────────────────────────

/**
 * Current on-chain holder of an inscription, via the ord server JSON at
 * `GET /r/inscription/<id>` (the recursive endpoint), which returns `address`
 * + `satpoint`.
 *
 * IMPORTANT: the non-recursive `/inscription/<id>` JSON API is DISABLED on the
 * public ordinals.com instance (HTTP 406 "JSON API disabled") — only
 * `/r/inscription/<id>` serves JSON there. The `/r/` endpoint is CDN-cacheable,
 * so on a fresh transfer the reported holder can lag by the cache TTL; that is
 * acceptable because we fail closed (never grant on stale/empty), and it goes
 * away once ORD_BASE_URL points at a self-hosted ord with the full JSON API.
 *
 * Returns null on non-200, parse failure, missing `address`, or network
 * error. null means "unknown" — callers MUST fail closed.
 */
export async function getInscriptionOwner(inscriptionId: string): Promise<InscriptionOwner | null> {
  try {
    const res = await ordFetch(`/r/inscription/${inscriptionId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const address: unknown = data?.address;
    if (typeof address !== 'string' || address.length === 0) return null;
    const satpoint: unknown = data?.satpoint;
    return {
      address,
      satpoint: typeof satpoint === 'string' ? satpoint : '',
    };
  } catch (e) {
    console.warn('[ord] getInscriptionOwner failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Address → inscriptions it currently holds ───────────────────

/**
 * Inscription ids currently held by an address.
 *
 * This used to call `GET /address/<addr>` and read `inscriptions[]`. That
 * endpoint is part of the non-recursive JSON API, which the public
 * ordinals.com instance answers with HTTP 406 "JSON API disabled" — the same
 * disablement already documented above for `/inscription/<id>`. So this
 * function returned null on EVERY call in production, and had no way not to.
 * The Unisat fallback its callers reached for next needs an Authorization
 * header no deploy sets, and answers 403 without one. Both providers were
 * dead, which is why `/api/v1/inscriptions/scan` reported zero inscriptions for
 * wallets visibly holding them and `/api/v1/auth/verify` could never confirm
 * ownership by wallet scan.
 *
 * The replacement composes two endpoints that are live on the public instance:
 * Esplora lists the address's current UTXOs, and ord's RECURSIVE
 * `GET /r/utxo/<outpoint>` names the inscriptions on each. Holding is still
 * established by a live indexer reading the current UTXO set — the same
 * guarantee as before, just over endpoints that answer.
 *
 * The `/r/` reads skip the client-wide serial throttle: they are CDN-cached
 * (see `getInscriptionOwner`), and a wallet's whole UTXO set at 1.1s apart
 * would exceed the request timeout on any real wallet. They run at bounded
 * concurrency instead.
 *
 * Returns null on any provider failure, INCLUDING a single failed outpoint
 * lookup — a partial list would understate what the wallet holds, and callers
 * read a short list as a real negative. An address that legitimately holds
 * nothing returns `[]`, so callers can still distinguish "down" (retry) from
 * "holds none".
 */
export async function getAddressInscriptions(address: string): Promise<string[] | null> {
  const outpoints = await getAddressOutpoints(address);
  if (outpoints === null) return null;
  if (outpoints.length === 0) return [];

  try {
    const perOutpoint = await mapWithConcurrency(outpoints, UTXO_LOOKUP_CONCURRENCY, async (outpoint) => {
      const res = await ordFetch(`/r/utxo/${outpoint}`, { throttle: false });
      if (!res.ok) throw new Error(`/r/utxo/${outpoint} -> ${res.status}`);
      const data = await res.json();
      const list: unknown = data?.inscriptions;
      if (!Array.isArray(list)) throw new Error(`/r/utxo/${outpoint} -> missing inscriptions[]`);
      return list.filter((id): id is string => typeof id === 'string' && id.length > 0);
    });
    return [...new Set(perOutpoint.flat())];
  } catch (e) {
    console.warn('[ord] getAddressInscriptions failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Indexer status / tip height (freshness gate) ────────────────

/**
 * Current indexer tip height, via `GET /blockheight` (raw integer) with a
 * `GET /status` fallback (`{ height }` / `{ blockHeight }`). Used as a
 * liveness/freshness gate before acting on a transfer.
 *
 * Returns null on failure — an absent freshness signal must never be treated
 * as "fresh".
 */
export async function getStatus(): Promise<OrdStatus | null> {
  // Primary: /blockheight returns a bare integer as text.
  try {
    const res = await ordFetch(`/blockheight`);
    if (res.ok) {
      const text = (await res.text()).trim();
      const height = Number.parseInt(text, 10);
      if (Number.isFinite(height) && height > 0) return { height };
    }
  } catch (e) {
    console.warn('[ord] getStatus /blockheight failed:', e instanceof Error ? e.message : e);
  }

  // Fallback: /status JSON.
  try {
    const res = await ordFetch(`/status`);
    if (res.ok) {
      const data = await res.json();
      const raw: unknown = data?.height ?? data?.blockHeight ?? data?.block_height;
      const height = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
      if (Number.isFinite(height) && height > 0) return { height };
    }
  } catch (e) {
    console.warn('[ord] getStatus /status failed:', e instanceof Error ? e.message : e);
  }

  return null;
}
