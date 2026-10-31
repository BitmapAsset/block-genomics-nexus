/**
 * "Which inscription is the deed for block N?" — one server-side answer.
 *
 * A block's deed is the FIRST valid `N.bitmap` inscription revealed from block
 * N onward (LiveOCI rule, `RULE_ID`): body exactly the bytes `N.bitmap`, no
 * bare number, no whitespace, no delegate, no content-encoding. Every later
 * inscription with the same text is a copy and owns nothing. The rule and the
 * first-ness proof live in `packages/bitmap-resolver` (mirrored under
 * `src/vendor/bitmap-resolver`, see scripts/sync-bitmap-resolver.mjs); this
 * module is the app's only door to it.
 *
 * The answer is derived from the chain alone. No parameter lets a caller name
 * or suggest an inscription, so nothing a request carries can change which
 * inscription the ownership gate asks about.
 *
 * VERDICTS (what the gate does with each):
 *   canonical     → the deed's id; the gate then checks its live holder.
 *   none          → no valid claim exists (an unmined block, or a walk that
 *                   reached the tip): nobody owns N, deny 403.
 *   disputed      → a human decides; never a grant: 503.
 *   undetermined  → a source was unreachable, sources disagree, or the answer
 *                   did not arrive within the request budget: 503, retryable.
 *
 * CACHE. A canonical id never changes for a (height, RULE_ID) once its reveal
 * is buried, so it is cached hard:
 *   1. in process (CANONICAL_TTL_MS), coalescing concurrent lookups;
 *   2. in the `DeedVerdict` table, written ONLY here and only for a canonical
 *      verdict revealed at least REORG_DEPTH blocks below the tip. Until that
 *      table's migration is applied the reads and writes fail and are ignored:
 *      the module then runs on the in-process cache alone.
 * `none` and `undetermined` are cached briefly, and only in process: a `none`
 * can turn into a deed once someone inscribes, and an outage should clear.
 *
 * BUDGET. Below 942,000 the resolver answers from the OCI plus a few ord and
 * Esplora reads. From 942,000 it walks raw blocks, which can take longer than
 * a request may wait. A lookup that misses REQUEST_BUDGET_MS answers
 * `undetermined` (the gate's 503) while the resolution keeps running and fills
 * the cache, and the ownership cron pre-resolves the blocks the app knows
 * about (`prewarmDeeds`). A wallet scan is never a substitute for the answer.
 */

import prisma from '@/lib/prisma';
import { getOrdHosts } from '@/lib/onchain/ord';
import { ESPLORA_BASES } from '@/lib/onchain/esplora';
import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';
import { resolve, RULE_ID, type ResolveResult } from '@/vendor/bitmap-resolver';

export const DEED_RULE_ID = RULE_ID;

/** How long a request waits for a resolution it does not have cached. */
export const REQUEST_BUDGET_MS = 8_000;
/** How long the cron waits per block when pre-resolving. */
export const PREWARM_BUDGET_MS = 45_000;
/** In-process lifetime of a canonical answer (the DB row outlives it). */
export const CANONICAL_TTL_MS = 6 * 60 * 60 * 1000;
/** In-process lifetime of a `none` answer. */
const NONE_TTL_MS = 60_000;
/** In-process lifetime of an `undetermined` / `disputed` answer. */
const UNSETTLED_TTL_MS = 10_000;
/** A canonical reveal this many blocks below the tip is persisted. */
const REORG_DEPTH = 6;
/** Blocks walked inline per resolution above 942,000. */
const WALK_CAP = 6;

export type DeedVerdict = 'canonical' | 'none' | 'disputed' | 'undetermined';

export interface CanonicalDeed {
  height: number;
  /** The deed's inscription id; set only for `canonical`. */
  inscriptionId: string | null;
  ruleId: string;
  verdict: DeedVerdict;
  /** ISO time the verdict was established. */
  resolvedAt: string;
  /** Plain-words reason for any verdict other than canonical. */
  reason?: string;
  /** Where this answer came from on this call. */
  source: 'memory' | 'db' | 'resolver';
}

interface Entry {
  deed: CanonicalDeed;
  expiresAt: number;
}

const memory = new Map<string, Entry>();
const inFlight = new Map<string, Promise<CanonicalDeed>>();

function key(height: number): string {
  return `${RULE_ID}:${height}`;
}

/**
 * The fetch the resolver uses: the app's chain User-Agent on every request, and
 * the Basic auth of a configured private ord host (lifted out of its URL by
 * lib/onchain/ord.ts) on requests to that host only.
 */
const chainFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init?.headers);
  headers.set('User-Agent', CHAIN_USER_AGENT);
  const ord = getOrdHosts()[0];
  if (ord?.authorization && url.startsWith(`${ord.base}/`)) headers.set('Authorization', ord.authorization);
  return fetch(input, { ...init, headers });
};

/** The resolver options the app uses (also read by scripts/ownership-dry-run.ts). */
export function deedResolverOptions() {
  const ord = getOrdHosts()[0];
  return {
    freshness: 'display' as const,
    walkCap: WALK_CAP,
    fetch: chainFetch,
    origins: { ...(ord ? { ord: ord.base } : {}), esplora: [...ESPLORA_BASES] },
  };
}

function fromResult(r: ResolveResult): CanonicalDeed {
  const canonical = r.verdict === 'canonical' && typeof r.canonicalId === 'string' && r.canonicalId.length > 0;
  return {
    height: r.height,
    inscriptionId: canonical ? r.canonicalId : null,
    ruleId: r.rule,
    // A canonical verdict without an id is not an answer the gate can use.
    verdict: canonical ? 'canonical' : r.verdict === 'canonical' ? 'undetermined' : r.verdict,
    resolvedAt: new Date().toISOString(),
    ...(r.reason && !canonical ? { reason: r.reason } : {}),
    source: 'resolver',
  };
}

function remember(deed: CanonicalDeed): void {
  const ttl =
    deed.verdict === 'canonical' ? CANONICAL_TTL_MS : deed.verdict === 'none' ? NONE_TTL_MS : UNSETTLED_TTL_MS;
  memory.set(key(deed.height), { deed, expiresAt: Date.now() + ttl });
}

async function readStored(height: number): Promise<CanonicalDeed | null> {
  try {
    const row = await prisma.deedVerdict.findUnique({ where: { height } });
    if (!row || row.ruleId !== RULE_ID || !row.inscriptionId) return null;
    return {
      height,
      inscriptionId: row.inscriptionId,
      ruleId: row.ruleId,
      verdict: 'canonical',
      resolvedAt: row.resolvedAt.toISOString(),
      source: 'db',
    };
  } catch {
    // Table not migrated yet, or the database is unreachable: resolve instead.
    return null;
  }
}

async function store(deed: CanonicalDeed, r: ResolveResult): Promise<void> {
  const revealHeight = r.proof?.canonical?.revealHeight;
  if (deed.verdict !== 'canonical' || !deed.inscriptionId) return;
  if (typeof revealHeight !== 'number' || r.checkedAtHeight - revealHeight < REORG_DEPTH) return;
  const data = {
    inscriptionId: deed.inscriptionId,
    ruleId: deed.ruleId,
    revealHeight,
    checkedAtHeight: r.checkedAtHeight,
    resolvedAt: new Date(deed.resolvedAt),
  };
  try {
    await prisma.deedVerdict.upsert({ where: { height: deed.height }, update: data, create: { height: deed.height, ...data } });
  } catch {
    // Table not migrated yet: the in-process cache still holds the answer.
  }
}

/** Resolve, cache, persist. Never throws: a failure is `undetermined`. */
async function resolveAndStore(height: number): Promise<CanonicalDeed> {
  let deed: CanonicalDeed;
  try {
    const r = await resolve(height, deedResolverOptions());
    deed = fromResult(r);
    await store(deed, r);
  } catch (e) {
    deed = {
      height,
      inscriptionId: null,
      ruleId: RULE_ID,
      verdict: 'undetermined',
      resolvedAt: new Date().toISOString(),
      reason: e instanceof Error ? e.message : 'resolver failed',
      source: 'resolver',
    };
  }
  remember(deed);
  return deed;
}

/**
 * Keep the serverless function alive until a background resolution lands.
 * `next/server` is loaded lazily: this module is also reached from server
 * components and non-request code, where importing it eagerly is not wanted.
 */
function keepAlive(work: Promise<unknown>): void {
  import('next/server')
    .then(({ after }) => after(() => work.then(() => undefined)))
    .catch(() => {
      // Outside a request (cron helpers, tests): the promise simply runs on.
    });
}

/**
 * The deed for `height` under `RULE_ID`.
 *
 * @param opts.budgetMs How long to wait for an uncached answer before returning
 *   `undetermined`; the resolution continues and fills the cache.
 */
export async function canonicalDeedFor(height: number, opts: { budgetMs?: number } = {}): Promise<CanonicalDeed> {
  if (!Number.isSafeInteger(height) || height < 0) {
    return {
      height,
      inscriptionId: null,
      ruleId: RULE_ID,
      verdict: 'none',
      resolvedAt: new Date().toISOString(),
      reason: 'not a block height',
      source: 'resolver',
    };
  }

  const k = key(height);
  const hit = memory.get(k);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.deed, source: 'memory' };

  let work = inFlight.get(k);
  if (!work) {
    work = (async () => {
      const stored = await readStored(height);
      if (stored) {
        remember(stored);
        return stored;
      }
      return resolveAndStore(height);
    })().finally(() => inFlight.delete(k));
    inFlight.set(k, work);
  }

  const budgetMs = opts.budgetMs ?? REQUEST_BUDGET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => res(null), budgetMs);
  });
  try {
    const answer = await Promise.race([work, late]);
    if (answer) return answer;
  } finally {
    clearTimeout(timer);
  }

  keepAlive(work);
  return {
    height,
    inscriptionId: null,
    ruleId: RULE_ID,
    verdict: 'undetermined',
    resolvedAt: new Date().toISOString(),
    reason: `no deed answer within ${budgetMs} ms; the check continues in the background`,
    source: 'resolver',
  };
}

/**
 * Resolve `heights` ahead of any request (the ownership cron), one at a time so
 * the resolver's per-host budget is shared rather than burst.
 */
export async function prewarmDeeds(
  heights: number[],
  opts: { budgetMs?: number; deadline?: number } = {},
): Promise<Array<{ height: number; verdict: DeedVerdict; source: CanonicalDeed['source'] }>> {
  const out: Array<{ height: number; verdict: DeedVerdict; source: CanonicalDeed['source'] }> = [];
  for (const height of heights) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    const deed = await canonicalDeedFor(height, { budgetMs: opts.budgetMs ?? PREWARM_BUDGET_MS });
    out.push({ height, verdict: deed.verdict, source: deed.source });
  }
  return out;
}

/** Test seam: forget every cached answer. */
export function __resetDeedCacheForTest(): void {
  memory.clear();
  inFlight.clear();
}
