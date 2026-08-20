/**
 * Two-tier owner resolution: a display cache and a live authorization tier.
 *
 * WHY THIS EXISTS
 * The protocol's core guarantee is that authorization follows LIVE on-chain
 * bitmap ownership at action time. Before this module, every owner lookup went
 * through one 5-minute memo, so an authorization decision could be served from
 * an observation taken up to 5 minutes earlier. The real guarantee was
 * therefore "within 5 minutes of a sale", not "at action time" — a seller kept
 * write authority over land they had already sold for the rest of the window.
 *
 * The fix is NOT "never cache". One global memo conflated two questions with
 * very different tolerances:
 *
 *   - DISPLAY ("who is shown as the owner of this block?") — minutes of
 *     staleness are harmless, and the read volume is high.
 *   - AUTH    ("may this wallet mutate this block right now?") — staleness IS
 *     the security bound, and the write volume is comparatively tiny.
 *
 * THE AUTH INVARIANT
 * An authorization lookup NEVER reads a stored observation. It always performs
 * — or joins — an indexer query that is in flight at decision time.
 *
 * This is deliberately an invariant rather than a short TTL. A tuned "auth
 * staleness" parameter is exactly the kind of number that gets raised later for
 * a latency win, silently reopening the window this module was written to
 * close. "Auth never reads cache" is a property a reviewer can check by
 * reading one function; "auth staleness is currently 10s" is a property that
 * has to be re-audited every time someone touches a constant.
 *
 * WHAT THAT DOES AND DOES NOT GUARANTEE
 * It guarantees WE hold no stale answer. It does not make the answer
 * instantaneous, and this module must not be described as if it did:
 *
 *   - The answer comes from an HTTP response, so it reflects indexer state from
 *     up to one request duration ago (ord.ts caps that at an 8s timeout).
 *   - The upstream indexer carries its own propagation delay. ordinals.com
 *     serves JSON only from the CDN-cacheable `/r/inscription/<id>` endpoint,
 *     so a fresh transfer can lag there regardless of what we do (see
 *     lib/onchain/ord.ts). Pointing ORD_BASE_URL at a self-hosted ord instance
 *     removes that term.
 *
 * SECOND-ORDER EFFECT: INDEXER LOAD
 * Querying live on every authorization sounds like it should multiply indexer
 * traffic. Two structural facts mean it does not:
 *
 *   1. ord.ts self-throttles to ~1 request/sec process-wide. Total indexer
 *      traffic is capped by construction, whatever this module decides; TTL
 *      tuning here could only ever trade staleness for write latency, never
 *      protect the indexer from a stampede it was already immune to.
 *   2. Request coalescing (single-flight) collapses concurrent lookups for the
 *      same inscription into ONE query, so a burst of writes against one block
 *      costs one round-trip rather than N sequential throttled ones.
 *
 * Net effect versus main: the hot authorization path (world writes) previously
 * bypassed the memo and hit the indexer on EVERY write with no coalescing, so
 * routing it here strictly REDUCES its query count. The paths that were being
 * cache-served (experiences, agent register, delegation listings) are
 * low-frequency owner operations, and they now warm the display cache for free.
 *
 * SCOPE: the display cache is per-process (a module-level Map), so serverless
 * instances each keep their own. That can only make a display read fresher than
 * its TTL (a cold instance queries live), never staler.
 */

import { getInscriptionOwner as ordGetInscriptionOwner, type InscriptionOwner } from '@/lib/onchain/ord';

/** How old an observation may be when a DISPLAY/READ path serves it. */
export const DISPLAY_TTL_MS = 5 * 60 * 1000;

/**
 * Which staleness bound applies.
 *
 * Required at every call site — there is no default, so a new caller cannot
 * silently inherit display staleness for an authorization decision.
 */
export type OwnerFreshness = 'auth' | 'display';

interface Observation {
  owner: InscriptionOwner | null;
  /** When the indexer answered, not when the entry was read. */
  observedAt: number;
}

const observations = new Map<string, Observation>();
const inFlight = new Map<string, Promise<InscriptionOwner | null>>();

/**
 * Current on-chain holder of an inscription.
 *
 * FAILS CLOSED: returns null when the indexer is down / non-200 / unparsable.
 * null means "on-chain truth unavailable", NOT "no owner" — callers must never
 * read it as a match or a transfer trigger.
 *
 * A null result is stored for the DISPLAY tier only. Auth never reads it back,
 * which matters more than it first appears: an outage makes ownership
 * INDETERMINATE, and some auth callers fall back to the DB snapshot when it is.
 * Under the old shared memo, one failed lookup pinned every authorization for
 * that inscription to the snapshot for a full 5 minutes.
 */
export async function resolveInscriptionOwner(
  inscriptionId: string,
  freshness: OwnerFreshness,
): Promise<InscriptionOwner | null> {
  if (freshness === 'display') {
    const cached = observations.get(inscriptionId);
    if (cached && Date.now() - cached.observedAt < DISPLAY_TTL_MS) {
      return cached.owner;
    }
  }

  // Coalesce. An open query is live, so joining it satisfies the auth invariant
  // just as well as starting another one would — and starting another would
  // queue behind the ord client's global throttle for no extra freshness.
  const open = inFlight.get(inscriptionId);
  if (open) return open;

  const query = (async () => {
    const owner = await ordGetInscriptionOwner(inscriptionId);
    observations.set(inscriptionId, { owner, observedAt: Date.now() });
    return owner;
  })().finally(() => {
    inFlight.delete(inscriptionId);
  });

  inFlight.set(inscriptionId, query);
  return query;
}

/** Convenience for callers that only need the holder address. */
export async function resolveInscriptionOwnerAddress(
  inscriptionId: string,
  freshness: OwnerFreshness,
): Promise<string | null> {
  return (await resolveInscriptionOwner(inscriptionId, freshness))?.address ?? null;
}

/**
 * Drop the stored observation for an inscription.
 *
 * Called once a transfer has been processed: a new on-chain owner has just been
 * established, so an observation from before the flip is known-stale and should
 * not serve even a display read.
 */
export function invalidateInscriptionOwner(inscriptionId: string): void {
  observations.delete(inscriptionId);
}

/** Test seam: drop all state so a suite can simulate a cold process. */
export function __resetOwnerObservations(): void {
  observations.clear();
  inFlight.clear();
}
