/**
 * ord server JSON client
 *
 * ordinals.com is a hosted `ord` instance, so its `ord` server JSON API
 * (Accept: application/json) is the on-chain source of truth for:
 *   - inscription → current holder address + satpoint
 *   - address → inscription ids it currently holds
 *   - indexer tip height (freshness gate)
 *
 * This is the ONLY place that talks to ord servers, so the host list and
 * request shape live in one spot.
 *
 * SECURITY: every function FAILS CLOSED — on non-200, parse failure, or
 * network error it returns null (or an empty/unknown result). Callers MUST
 * treat null as "on-chain truth unavailable" and never grant ownership or
 * trigger a transfer on it. Do not invent a "trust on outage" path here.
 *
 * HOSTS: `ORD_BASE_URLS` (comma-separated, tried in order) with
 * `ORD_BASE_URL` still honoured and placed first. With neither set the list
 * is `DEFAULT_ORD_BASE_URLS`. A configured list replaces the default rather
 * than extending it, so an operator who wants ordinals.com as a backup lists it.
 * Pointing at a self-hosted ord is an env change with zero code change and NO
 * new required env for deploy.
 *
 * Next to these, `DEED_CROSSCHECK_URL` (+ optional `DEED_CROSSCHECK_AUTH`,
 * `DEED_CROSSCHECK_ALERT_CHAT_ID`) points the ownership gate at an independent
 * bitmap index that must name the same deed before a grant; see
 * lib/onchain/deed-crosscheck.ts. Unset, the gate behaves as before.
 *
 * FAILOVER: a host that answers 403, 429 or 5xx, times out, closes the
 * connection, or sends a body that is not the JSON we asked for gets a second
 * attempt after a short backoff, inside an 8s budget per host, and then the next
 * host is tried. A host that exhausts its attempts is skipped for 60s by every
 * call in this process, so one request pays for a dead host, not every request.
 * Any other status (404, 400, 406) is the host's real answer and is returned
 * as-is: another host would say the same thing.
 *
 * Since 2026-10-22 ordinals.com (and the Magic Eden mirror) answer every
 * scripted request with a Cloudflare 403 block page, whatever the User-Agent.
 * The holder question then falls through to the Esplora sat tracker
 * (sat-tracker.ts); nothing in this file works around the block.
 */

import { getAddressOutpoints } from '@/lib/onchain/esplora';
import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';

export const DEFAULT_ORD_BASE_URLS: readonly string[] = ['https://ordinals.com'];

/** Budget for all attempts against one host. */
const HOST_BUDGET_MS = 8000;
let hostBudgetMs = HOST_BUDGET_MS;
const ATTEMPTS_PER_HOST = 2;
const RETRY_BACKOFF_MS = 250;
/** How long a host that exhausted its attempts is skipped. */
export const HOST_COOLDOWN_MS = 60_000;

/** Parallel `/r/utxo` reads per wallet scan. Verified against ordinals.com: 16 at once answered 200 in ~0.6s. */
const UTXO_LOOKUP_CONCURRENCY = 8;

// Self-throttle to ~1 request/sec. ownership-sync previously enforced this
// (a ~1.1s min interval, hinting at prior 429s from ordinals.com), so we keep
// that behavior centralized here for every ord call.
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestTs = 0;
let minRequestIntervalMs = MIN_REQUEST_INTERVAL_MS;
let retryBackoffMs = RETRY_BACKOFF_MS;

// ─── Host list ───────────────────────────────────────────────────

export interface OrdHost {
  /** Base URL: no slash at the end, no credentials, no query. */
  base: string;
  /** host[:port][/path] for logs and API responses. Never carries credentials. */
  label: string;
  /** Basic auth lifted out of `https://user:pass@host`, which fetch refuses to send. */
  authorization?: string;
}

function toHost(entry: string): OrdHost | null {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let authorization: string | undefined;
  if (url.username || url.password) {
    const user = decodeURIComponent(url.username);
    const pass = decodeURIComponent(url.password);
    authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  url.search = '';
  url.hash = '';

  const path = url.pathname.replace(/\/+$/, '');
  return { base: `${url.origin}${path}`, label: `${url.host}${path}`, authorization };
}

/**
 * The ordered ord host list from `ORD_BASE_URLS` / `ORD_BASE_URL`.
 *
 * Entries are trimmed, end slashes removed, duplicates removed (first one
 * wins) and anything that is not an http(s) URL skipped with a warning that
 * names the entry's position, never its value: a value can carry credentials.
 * If nothing usable is configured the default list applies.
 */
export function parseOrdBaseUrls(list?: string | null, single?: string | null): OrdHost[] {
  const configured = [single ?? '', ...(list ?? '').split(',')].map((s) => s.trim()).filter(Boolean);

  const hosts: OrdHost[] = [];
  const seen = new Set<string>();
  configured.forEach((entry, i) => {
    const host = toHost(entry);
    if (!host) {
      console.warn(`[ord] ignoring ord base URL entry #${i + 1}: not an http(s) URL`);
      return;
    }
    if (seen.has(host.base)) return;
    seen.add(host.base);
    hosts.push(host);
  });

  if (hosts.length > 0) return hosts;
  if (configured.length > 0) console.warn('[ord] no usable ord base URL configured; using the default list');
  return DEFAULT_ORD_BASE_URLS.map((u) => toHost(u)).filter((h): h is OrdHost => h !== null);
}

let ordHosts: OrdHost[] = parseOrdBaseUrls(process.env.ORD_BASE_URLS, process.env.ORD_BASE_URL);

/** The configured hosts, in the order they are tried. */
export function getOrdHosts(): readonly OrdHost[] {
  return ordHosts;
}

// ─── Host health memory ──────────────────────────────────────────

export interface OrdHostHealth {
  host: string;
  /** null until this process has talked to the host. */
  ok: boolean | null;
  /** Last HTTP status, or null for a timeout / network error / no attempt yet. */
  lastStatus: number | null;
  lastError: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  lastOkAt: string | null;
  /** Set while the host is being skipped. */
  coolingDownUntil: string | null;
}

interface HealthState {
  ok: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
  latencyMs: number | null;
  checkedAt: number | null;
  lastOkAt: number | null;
  unhealthyUntil: number;
}

const health = new Map<string, HealthState>();

function stateFor(host: OrdHost): HealthState {
  let s = health.get(host.base);
  if (!s) {
    s = { ok: null, lastStatus: null, lastError: null, latencyMs: null, checkedAt: null, lastOkAt: null, unhealthyUntil: 0 };
    health.set(host.base, s);
  }
  return s;
}

function noteAttempt(host: OrdHost, ok: boolean, status: number | null, latencyMs: number, error: string | null): void {
  const s = stateFor(host);
  const now = Date.now();
  s.ok = ok;
  s.lastStatus = status;
  s.lastError = error;
  s.latencyMs = latencyMs;
  s.checkedAt = now;
  if (ok) {
    s.lastOkAt = now;
    s.unhealthyUntil = 0;
  }
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/** What this process last saw from each configured host, in try order. */
export function getOrdHostHealth(): OrdHostHealth[] {
  const now = Date.now();
  return ordHosts.map((host) => {
    const s = health.get(host.base);
    return {
      host: host.label,
      ok: s?.ok ?? null,
      lastStatus: s?.lastStatus ?? null,
      lastError: s?.lastError ?? null,
      latencyMs: s?.latencyMs ?? null,
      checkedAt: iso(s?.checkedAt ?? null),
      lastOkAt: iso(s?.lastOkAt ?? null),
      coolingDownUntil: s && s.unhealthyUntil > now ? iso(s.unhealthyUntil) : null,
    };
  });
}

/**
 * Test seam: re-read the host list (from the arguments, else the env), forget
 * all health and throttle state, and optionally shorten the waits.
 */
export function __resetOrdClientForTest(
  opts: { list?: string | null; single?: string | null; throttleMs?: number; backoffMs?: number; hostBudgetMs?: number } = {},
): void {
  ordHosts = parseOrdBaseUrls(
    opts.list === undefined ? process.env.ORD_BASE_URLS : opts.list,
    opts.single === undefined ? process.env.ORD_BASE_URL : opts.single,
  );
  health.clear();
  lastRequestTs = 0;
  minRequestIntervalMs = opts.throttleMs ?? MIN_REQUEST_INTERVAL_MS;
  retryBackoffMs = opts.backoffMs ?? RETRY_BACKOFF_MS;
  hostBudgetMs = opts.hostBudgetMs ?? HOST_BUDGET_MS;
}

// ─── Request core ────────────────────────────────────────────────

/** A host's real answer. `json` is set for a 2xx reply to an `expect: 'json'` request. */
export interface OrdReply {
  status: number;
  ok: boolean;
  body: string;
  json?: unknown;
  /** Label of the host that answered. */
  host: string;
  /** The `Content-Encoding` the host declared on a text reply, if any. */
  contentEncoding?: string | null;
}

type Expect = 'json' | 'text';

function isFailoverStatus(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  const wait = minRequestIntervalMs - (Date.now() - lastRequestTs);
  if (wait > 0) await sleep(wait);
  lastRequestTs = Date.now();
}

/** Only the route shape goes in logs: ids and outpoints are noise there, not secrets. */
function routeOf(path: string): string {
  return path.split('/').slice(0, 3).join('/');
}

async function attempt(host: OrdHost, path: string, expect: Expect, timeoutMs: number):
  Promise<{ reply: OrdReply } | { failure: string }> {
  const headers: Record<string, string> = {
    Accept: expect === 'json' ? 'application/json' : '*/*',
    'User-Agent': CHAIN_USER_AGENT,
  };
  if (host.authorization) headers.Authorization = host.authorization;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${host.base}${path}`, { headers, signal: controller.signal });

    if (isFailoverStatus(res.status)) {
      await res.body?.cancel().catch(() => {});
      noteAttempt(host, false, res.status, Date.now() - started, `http_${res.status}`);
      return { failure: `http_${res.status}` };
    }
    if (res.ok && expect === 'json') {
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        if (controller.signal.aborted) throw new Error('aborted');
        // A block page or captive portal served with 200 is an outage, not data.
        noteAttempt(host, false, res.status, Date.now() - started, 'not_json');
        return { failure: 'not_json' };
      }
      noteAttempt(host, true, res.status, Date.now() - started, null);
      return { reply: { status: res.status, ok: true, body: '', json, host: host.label } };
    }
    const body = await res.text();
    noteAttempt(host, true, res.status, Date.now() - started, null);
    const contentEncoding = res.headers?.get?.('content-encoding') ?? null;
    return { reply: { status: res.status, ok: res.ok, body, host: host.label, contentEncoding } };
  } catch {
    const failure = controller.signal.aborted ? 'timeout' : 'network';
    noteAttempt(host, false, null, Date.now() - started, failure);
    return { failure };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET `path` from the first configured ord host that gives a real answer.
 *
 * Returns null when no host did: every host failed over, or every host is
 * cooling down. null is "unavailable", never "not found".
 */
export async function ordGet(
  path: string,
  opts: { throttle?: boolean; expect?: Expect } = {},
): Promise<OrdReply | null> {
  const expect = opts.expect ?? 'json';
  const now = Date.now();
  const candidates = ordHosts.filter((h) => stateFor(h).unhealthyUntil <= now);
  if (candidates.length === 0) return null;

  if (opts.throttle !== false) await throttle();

  for (let i = 0; i < candidates.length; i++) {
    const host = candidates[i];
    const deadline = Date.now() + hostBudgetMs;
    let failure = 'no_attempt';
    let attempts = 0;

    while (attempts < ATTEMPTS_PER_HOST) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      attempts++;
      const result = await attempt(host, path, expect, remaining);
      if ('reply' in result) return result.reply;
      failure = result.failure;
      if (attempts < ATTEMPTS_PER_HOST && deadline - Date.now() > retryBackoffMs) {
        await sleep(retryBackoffMs * attempts);
      }
    }

    const state = stateFor(host);
    // Concurrent calls (a wallet scan runs eight) fail over together; only the
    // one that starts the cooldown logs it.
    const alreadyCooling = state.unhealthyUntil > Date.now();
    state.unhealthyUntil = Date.now() + HOST_COOLDOWN_MS;
    if (alreadyCooling) continue;
    console.warn(JSON.stringify({
      event: 'ord_failover',
      host: host.label,
      route: routeOf(path),
      reason: failure,
      attempts,
      next: candidates[i + 1]?.label ?? null,
    }));
  }
  return null;
}

/**
 * One direct probe of one host for the health route: a single attempt, no
 * cooldown skip, no throttle. A success clears the host's cooldown.
 */
export async function probeOrdHost(
  host: OrdHost,
  path: string,
  timeoutMs: number,
): Promise<{ reply: OrdReply } | { failure: string }> {
  return attempt(host, path, 'text', timeoutMs);
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
  /** Which source answered: an ord host label, or `esplora:<host>` for the sat tracker. */
  source?: string;
  /** The inscription this one delegates its content to, when ord reports one. */
  delegate?: string | null;
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
 * `/r/inscription/<id>` serves JSON there. The `/r/` endpoint may be cached by a
 * CDN (observed uncached on 2026-10-14: `cf-cache-status: BYPASS`); if it ever
 * is, a fresh transfer's reported holder can lag by the cache TTL. That is
 * acceptable because we fail closed (never grant on stale/empty), and it goes
 * away once the host list points at a self-hosted ord with the full JSON API.
 *
 * Returns null on non-200, parse failure, missing `address`, or when no host
 * answered. null means "unknown" — callers MUST fail closed.
 */
export async function getInscriptionOwner(inscriptionId: string): Promise<InscriptionOwner | null> {
  try {
    const reply = await ordGet(`/r/inscription/${inscriptionId}`);
    if (!reply || !reply.ok) return null;
    const data = reply.json as { address?: unknown; satpoint?: unknown; delegate?: unknown } | null;
    const address: unknown = data?.address;
    if (typeof address !== 'string' || address.length === 0) return null;
    const satpoint: unknown = data?.satpoint;
    const delegate: unknown = data?.delegate;
    return {
      address,
      satpoint: typeof satpoint === 'string' ? satpoint : '',
      source: reply.host,
      ...(typeof delegate === 'string' && delegate.length > 0 ? { delegate } : {}),
    };
  } catch (e) {
    console.warn('[ord] getInscriptionOwner failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Raw content of an inscription (`GET /content/<id>`) as text, from the first
 * ord host that answers. Content is immutable, so this skips the throttle.
 *
 * Returns null when no host answered or the inscription is unknown to it.
 */
export async function getInscriptionContent(inscriptionId: string): Promise<string | null> {
  try {
    const reply = await ordGet(`/content/${encodeURIComponent(inscriptionId)}`, { throttle: false, expect: 'text' });
    if (!reply || !reply.ok) return null;
    return reply.body;
  } catch (e) {
    console.warn('[ord] getInscriptionContent failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Like `getInscriptionContent`, plus the `Content-Encoding` the host declared.
 * The ownership gate needs it: a deed is never content-encoded, and fetch would
 * otherwise hand back decoded bytes that look exactly like a deed's.
 */
export async function getInscriptionBody(
  inscriptionId: string,
): Promise<{ text: string; contentEncoding: string | null } | null> {
  try {
    const reply = await ordGet(`/content/${encodeURIComponent(inscriptionId)}`, { throttle: false, expect: 'text' });
    if (!reply || !reply.ok) return null;
    return { text: reply.body, contentEncoding: reply.contentEncoding ?? null };
  } catch (e) {
    console.warn('[ord] getInscriptionBody failed:', e instanceof Error ? e.message : e);
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
      const reply = await ordGet(`/r/utxo/${outpoint}`, { throttle: false });
      if (!reply) throw new Error(`/r/utxo/${outpoint} -> no ord host answered`);
      if (!reply.ok) throw new Error(`/r/utxo/${outpoint} -> ${reply.status}`);
      const list: unknown = (reply.json as { inscriptions?: unknown } | null)?.inscriptions;
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
    const reply = await ordGet(`/blockheight`, { expect: 'text' });
    if (reply?.ok) {
      const height = Number.parseInt(reply.body.trim(), 10);
      if (Number.isFinite(height) && height > 0) return { height };
    }
  } catch (e) {
    console.warn('[ord] getStatus /blockheight failed:', e instanceof Error ? e.message : e);
  }

  // Fallback: /status JSON.
  try {
    const reply = await ordGet(`/status`);
    if (reply?.ok) {
      const data = reply.json as { height?: unknown; blockHeight?: unknown; block_height?: unknown } | null;
      const raw: unknown = data?.height ?? data?.blockHeight ?? data?.block_height;
      const height = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
      if (Number.isFinite(height) && height > 0) return { height };
    }
  } catch (e) {
    console.warn('[ord] getStatus /status failed:', e instanceof Error ? e.message : e);
  }

  return null;
}
