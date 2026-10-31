/**
 * A second opinion on "which inscription is the deed for block N", from an
 * independent bitmap index, asked before ownership is granted.
 *
 * Our resolver (lib/onchain/deed.ts) decides the deed. When a cross-check index
 * is configured, a grant also needs that index to name the SAME inscription,
 * and the holder to come from an ord host. Anything else is a retryable 503:
 *
 *   index names the resolver's id         → agree: the gate goes on
 *   index names another id, or none       → disagree: 503 + alert + counter
 *   index unreachable, slow, malformed,
 *   or not yet indexed up to N            → unavailable: 503
 *
 * With the index unset nothing here runs and the gate behaves as before.
 * It never writes `DeedVerdict`.
 *
 * Outside the gate it is consulted in one place: `verifyBlockOwnership`
 * (lib/ownership-sync.ts) asks it on a live mismatch at every freshness tier,
 * because the cron's batch runs at the display tier and its transfers must wait
 * for the same confirmation. So a public `GET /api/v1/ownership/<h>` (or
 * `/verify`) on a mismatched block also asks the index (cached as below), and its `action`
 * reads `none` while the transfer waits; verdict, holder and match are
 * unchanged. A block whose record matches the holder never asks.
 *
 * The index speaks the OPI bitmap API (bestinslot-xyz/OPI, modules/bitmap_api):
 *   GET /v1/bitmap/get_inscription_id_of_bitmap?bitmap_number=N
 *       200 {error:null, result:{inscription_id, bitmap_number}}
 *       400 {error:'bitmap not found', result:null}   → names no inscription
 *   GET /v1/bitmap/block_height                       → the indexed height
 *   GET /v1/bitmap/get_hash_of_all_bitmaps            → {result:{block_height}}
 * The height route as published sends an unawaited promise (`{}`), so a
 * height that does not parse falls back to the hash route's `block_height`.
 *
 * ENV (set in the deployment, never in the repo):
 *   DEED_CROSSCHECK_URL            base URL of the index (https://host[/path])
 *   DEED_CROSSCHECK_AUTH           optional Authorization header value, sent to
 *                                  that base only (e.g. an access token)
 *   DEED_CROSSCHECK_ALERT_CHAT_ID  optional Telegram chat for disagreement
 *                                  alerts (delivery also needs the bot token)
 *
 * CACHE: an answer from the index lives 10 minutes in process, a failure 10 s.
 */

import { sendTelegramEscalation } from '@/lib/escalation-notify';
import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';

/** How long the index's answer for a height is reused. */
export const ANSWER_TTL_MS = 10 * 60 * 1000;
/** How long a failed lookup is reused before asking again. */
export const FAILURE_TTL_MS = 10_000;
/** How long the indexed height is reused. */
const HEIGHT_TTL_MS = 60_000;
/** Per-request timeout. */
const FETCH_TIMEOUT_MS = 4_000;

const INSCRIPTION_ID = /^[0-9a-f]{64}i\d{1,10}$/;

export type CrossCheckState = 'agree' | 'disagree' | 'unavailable' | 'unset';

export interface CrossCheckResult {
  state: CrossCheckState;
  /** What the index names for the height (null = no inscription); absent when it could not say. */
  indexId?: string | null;
  indexedHeight?: number | null;
  reason?: string;
}

interface Config {
  base: string;
  label: string;
  authorization: string | null;
  alertChatId: string | null;
}

function config(): Config | null {
  const raw = (process.env.DEED_CROSSCHECK_URL ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, '');
  const auth = (process.env.DEED_CROSSCHECK_AUTH ?? '').trim();
  const chat = (process.env.DEED_CROSSCHECK_ALERT_CHAT_ID ?? '').trim();
  return { base: `${url.origin}${path}`, label: `${url.host}${path}`, authorization: auth || null, alertChatId: chat || null };
}

/** True when an index is configured (a malformed URL counts as configured: it can only fail closed). */
export function isDeedCrossCheckConfigured(): boolean {
  return (process.env.DEED_CROSSCHECK_URL ?? '').trim() !== '';
}

type Lookup = { ok: true; indexId: string | null; indexedHeight: number } | { ok: false; reason: string; indexedHeight?: number | null };

const answers = new Map<number, { at: number; value: Lookup }>();
const inFlight = new Map<number, Promise<Lookup>>();
let heightMemo: { at: number; value: number | null } | null = null;
const alerted = new Map<string, number>();

const stats = {
  agreements: 0,
  disagreements: 0,
  unavailable: 0,
  lastOkAt: null as number | null,
  indexedHeight: null as number | null,
};

class IndexError extends Error {}

async function get(cfg: Config, path: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': CHAIN_USER_AGENT };
  if (cfg.authorization) headers.Authorization = cfg.authorization;
  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new IndexError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'unreachable');
  }
  const text = await res.text().catch(() => '');
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text stays a string */
  }
  return { status: res.status, body };
}

function asHeight(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function indexedHeight(cfg: Config): Promise<number> {
  if (heightMemo && Date.now() - heightMemo.at < (heightMemo.value === null ? FAILURE_TTL_MS : HEIGHT_TTL_MS)) {
    if (heightMemo.value === null) throw new IndexError('indexed height unavailable');
    return heightMemo.value;
  }
  let h: number | null = null;
  try {
    const a = await get(cfg, '/v1/bitmap/block_height');
    if (a.status === 200) h = asHeight(a.body) ?? asHeight((a.body as { result?: unknown } | null)?.result);
    if (h === null) {
      const b = await get(cfg, '/v1/bitmap/get_hash_of_all_bitmaps');
      if (b.status === 200) h = asHeight((b.body as { result?: { block_height?: unknown } } | null)?.result?.block_height);
    }
  } catch (e) {
    heightMemo = { at: Date.now(), value: null };
    throw e;
  }
  heightMemo = { at: Date.now(), value: h };
  if (h === null) throw new IndexError('indexed height malformed');
  return h;
}

async function lookup(cfg: Config, height: number): Promise<Lookup> {
  let tip: number;
  try {
    tip = await indexedHeight(cfg);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  stats.indexedHeight = tip;
  if (height > tip) return { ok: false, reason: `index has not reached block ${height} (indexed to ${tip})`, indexedHeight: tip };
  let reply;
  try {
    reply = await get(cfg, `/v1/bitmap/get_inscription_id_of_bitmap?bitmap_number=${height}`);
  } catch (e) {
    return { ok: false, reason: (e as Error).message, indexedHeight: tip };
  }
  const body = reply.body as { error?: unknown; result?: { inscription_id?: unknown; bitmap_number?: unknown } | null } | null;
  if (reply.status === 400 && body && typeof body === 'object' && body.error === 'bitmap not found' && body.result === null) {
    return { ok: true, indexId: null, indexedHeight: tip };
  }
  if (reply.status !== 200) return { ok: false, reason: `index answered HTTP ${reply.status}`, indexedHeight: tip };
  const id = body?.result?.inscription_id;
  const number = body?.result?.bitmap_number;
  if (typeof id !== 'string' || !INSCRIPTION_ID.test(id) || String(number) !== String(height)) {
    return { ok: false, reason: 'index answer malformed', indexedHeight: tip };
  }
  return { ok: true, indexId: id, indexedHeight: tip };
}

async function cachedLookup(cfg: Config, height: number): Promise<Lookup> {
  const hit = answers.get(height);
  if (hit && Date.now() - hit.at < (hit.value.ok ? ANSWER_TTL_MS : FAILURE_TTL_MS)) return hit.value;
  let work = inFlight.get(height);
  if (!work) {
    work = lookup(cfg, height)
      .then((value) => {
        answers.set(height, { at: Date.now(), value });
        if (value.ok) stats.lastOkAt = Date.now();
        return value;
      })
      .finally(() => inFlight.delete(height));
    inFlight.set(height, work);
  }
  return work;
}

function alert(cfg: Config, height: number, resolverId: string | null, indexId: string | null): void {
  const key = `${height}:${resolverId}:${indexId}`;
  const last = alerted.get(key);
  if (last !== undefined && Date.now() - last < ANSWER_TTL_MS) return;
  alerted.set(key, Date.now());
  console.error(
    `[deed-crosscheck] ${JSON.stringify({ event: 'deed_crosscheck_disagreement', height, resolver: resolverId, index: indexId, indexHost: cfg.label })}`,
  );
  if (cfg.alertChatId) {
    const text =
      `Deed cross-check disagreement for block ${height}: resolver ${resolverId ?? 'none'}, ` +
      `index ${indexId ?? 'none'}. Ownership for this block answers 503 until they agree.`;
    void sendTelegramEscalation(cfg.alertChatId, text).catch(() => undefined);
  }
}

/**
 * Ask the index which inscription it holds for `height` and compare it with the
 * resolver's answer (`resolverId`; null when the resolver found no valid deed).
 * Never throws.
 */
export async function crossCheckDeed(height: number, resolverId: string | null): Promise<CrossCheckResult> {
  if (!isDeedCrossCheckConfigured()) return { state: 'unset' };
  const cfg = config();
  if (!cfg) {
    stats.unavailable++;
    return { state: 'unavailable', reason: 'DEED_CROSSCHECK_URL is not a usable http(s) URL' };
  }
  const got = await cachedLookup(cfg, height);
  if (!got.ok) {
    stats.unavailable++;
    return { state: 'unavailable', reason: got.reason, indexedHeight: got.indexedHeight ?? null };
  }
  if (got.indexId === resolverId) {
    stats.agreements++;
    return { state: 'agree', indexId: got.indexId, indexedHeight: got.indexedHeight };
  }
  stats.disagreements++;
  alert(cfg, height, resolverId, got.indexId);
  return {
    state: 'disagree',
    indexId: got.indexId,
    indexedHeight: got.indexedHeight,
    reason: `index names ${got.indexId ?? 'no inscription'}, resolver ${resolverId ?? 'none'}`,
  };
}

export interface DeedCrossCheckHealth {
  configured: boolean;
  /** host[/path] of the index; never carries credentials. */
  host: string | null;
  lastOkAt: string | null;
  indexedHeight: number | null;
  agreements: number;
  disagreements: number;
  unavailable: number;
}

/** Counts only; safe on any read path (no request is made). */
export function getDeedCrossCheckHealth(): DeedCrossCheckHealth {
  const cfg = config();
  return {
    configured: isDeedCrossCheckConfigured(),
    host: cfg?.label ?? null,
    lastOkAt: stats.lastOkAt === null ? null : new Date(stats.lastOkAt).toISOString(),
    indexedHeight: stats.indexedHeight,
    agreements: stats.agreements,
    disagreements: stats.disagreements,
    unavailable: stats.unavailable,
  };
}

/** Test seam: forget answers, counters and alert memory. */
export function __resetDeedCrossCheckForTest(): void {
  answers.clear();
  inFlight.clear();
  alerted.clear();
  heightMemo = null;
  stats.agreements = 0;
  stats.disagreements = 0;
  stats.unavailable = 0;
  stats.lastOkAt = null;
  stats.indexedHeight = null;
}
