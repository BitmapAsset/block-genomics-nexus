/**
 * Non-blocking deed lookup for PUBLIC, READ-ONLY page rendering.
 *
 * The ord client self-throttles to ~1 request/sec process-wide. That is correct
 * for the sync jobs it was built for, but it sits in the render path of
 * `/block/[height]`, and ownership is cached per *inscription*. A crawler
 * sweeping distinct blocks therefore misses the cache on every hit and
 * serialises: the 50th block in a sweep waits ~55s behind the throttle, and the
 * whole site's ord budget is consumed by a bot.
 *
 * So the public render path never awaits the throttled call. It answers from a
 * cache if a recent answer exists, and otherwise renders immediately with "not
 * confirmed" while a background warm fills the cache for the next request. The
 * page already distinguishes "confirmed holder" from "not confirmed right now",
 * so this degrades into an existing, honest state rather than a new lie.
 *
 * The cache here is deliberately local rather than a peek into
 * `ownership-sync`'s: this is a rendering concern, and the auth/write paths own
 * their own cache semantics. Nothing in this file is authoritative — callers on
 * a write or authorization path must use `verifyBlockOwnership` and await it.
 */

import { getInscriptionOwner } from '@/lib/ownership-sync';

const TTL_MS = 5 * 60 * 1000;

/**
 * Entry ceiling. A crawler walking every claimed block would otherwise grow this
 * map without bound; at the cap the oldest entries are dropped, which costs a
 * re-warm and nothing else.
 */
const MAX_ENTRIES = 5_000;

/**
 * Ceiling on background warms awaiting the ~1/sec throttle. Without it a burst
 * queues thousands of fetches that drain slower than they arrive, so the queue
 * outlives the burst and warms blocks nobody is looking at any more. Warms
 * beyond the cap are dropped; the next request for that block re-schedules one.
 */
const MAX_PENDING_WARMS = 16;

type Entry = { address: string | null; ts: number };

const cache = new Map<string, Entry>();
const inFlight = new Set<string>();

/** Test seam — resets module state between cases. */
export function __resetPublicOwnerLookup(): void {
  cache.clear();
  inFlight.clear();
}

/** Test/diagnostic seam. */
export function __publicOwnerLookupStats() {
  return { cached: cache.size, pending: inFlight.size };
}

function readFresh(inscriptionId: string, now: number): Entry | undefined {
  const hit = cache.get(inscriptionId);
  if (!hit) return undefined;
  if (now - hit.ts >= TTL_MS) {
    cache.delete(inscriptionId);
    return undefined;
  }
  return hit;
}

function store(inscriptionId: string, address: string | null, now: number): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(inscriptionId)) {
    // Map preserves insertion order, so the first key is the oldest write.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(inscriptionId, { address, ts: now });
}

/**
 * Fill the cache for a later request. Never awaited by the caller and never
 * throws: a failed warm just leaves the entry cold.
 */
function scheduleWarm(inscriptionId: string): void {
  if (inFlight.has(inscriptionId)) return;
  if (inFlight.size >= MAX_PENDING_WARMS) return;

  inFlight.add(inscriptionId);
  void (async () => {
    try {
      store(inscriptionId, await getInscriptionOwner(inscriptionId), Date.now());
    } catch {
      // Leave it cold rather than caching the failure: storing null here would
      // read back as "no owner", and a thrown lookup cannot tell an unowned
      // inscription from an unreachable indexer.
    } finally {
      inFlight.delete(inscriptionId);
    }
  })();
}

export interface PublicOwnerResult {
  /** Live holder, or null when this request has no confirmed answer. */
  address: string | null;
  /**
   * True when the answer is null only because we chose not to wait for the
   * throttled indexer call. Lets the UI say "checking" instead of implying the
   * indexer is down.
   */
  pending: boolean;
}

/**
 * Deed holder for a public page render, without ever awaiting the throttle.
 *
 * Synchronous by design: an `async` signature would invite a caller to believe
 * awaiting it does something useful.
 */
export function lookupOwnerForRender(inscriptionId: string | null): PublicOwnerResult {
  if (!inscriptionId) return { address: null, pending: false };

  const hit = readFresh(inscriptionId, Date.now());
  if (hit) return { address: hit.address, pending: false };

  scheduleWarm(inscriptionId);
  return { address: null, pending: true };
}
