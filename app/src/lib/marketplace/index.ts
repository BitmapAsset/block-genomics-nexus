/**
 * Marketplace lane — public entry point.
 *
 * Answers one question: what are third-party ordinals marketplaces currently
 * advertising about this block? Aggregates across configured venues, ranks by
 * price, caches briefly, and degrades to an explicit "unavailable" rather than
 * failing the caller.
 *
 * ## This data never gates anything
 *
 * Ownership is decided on-chain (`/api/v1/ownership/verify`, and the live
 * indexer path the block page uses). A venue is an untrusted upstream that can
 * claim anything about anyone, so its output is display-only: it decorates a
 * page and answers a read API, and there is deliberately no path from a
 * `BlockMarket` into an authorization decision. The `advisory: true` flag on
 * every payload is the machine-readable form of that promise — if a future
 * caller ever branches on market data to grant access, that flag is the thing
 * that should have stopped them.
 *
 * ## Caching
 *
 * A 60-second in-process TTL. Prices move slower than crawler traffic, and the
 * public block page is a share target — without this, a link doing numbers
 * turns into a burst of upstream calls against a metered API key.
 *
 * Honest limitation, same one `api-rate-limit.ts` documents about the in-memory
 * limiter: on serverless this cache is per-instance, so N warm lambdas mean up
 * to N upstream calls per TTL window rather than one. That is a cost ceiling
 * concern, not a correctness one, and it is still an order of magnitude better
 * than uncached. A shared cache would mean a new paid dependency, which is not
 * this lane's call to make.
 */

import type { BlockMarket, MarketListing, VenueAdapter, VenueQuery } from './types';
import { sanitizeVenueUrl } from './normalize';
import { magicEdenAdapter } from './venues/magiceden';

export * from './types';
export { fetchVenueJson, hostIsAllowed } from './venue-fetch';

/** How long a market view stays fresh. */
export const MARKET_CACHE_TTL_MS = 60_000;
/** Cap on cached entries, so a crawler sweeping distinct blocks cannot grow this without bound. */
const MARKET_CACHE_MAX_ENTRIES = 500;

/**
 * Wall-clock budget for a single venue's answer.
 *
 * Not redundant with the fetcher's own timeout: that one bounds `fetch`, but DNS
 * resolution happens outside the AbortController, and an adapter may make more
 * than one sequential call (Magic Eden makes two). Without a budget here, a
 * stalled resolver could hold a caller far past any per-request timeout. This is
 * the ceiling that actually bounds `getBlockMarket`.
 */
export const VENUE_QUERY_BUDGET_MS = 6000;

/** Every venue the lane knows how to read, configured or not. */
const ALL_VENUES: readonly VenueAdapter[] = [magicEdenAdapter];

/** The venues that actually have what they need to answer. */
export function resolveVenues(): VenueAdapter[] {
  return ALL_VENUES.filter((v) => v.isConfigured());
}

interface CacheEntry {
  expiresAt: number;
  value: BlockMarket;
}
const cache = new Map<string, CacheEntry>();

/**
 * Cache key.
 *
 * Includes the inscription id, not just the height, because the id is an input
 * to the answer: a block that gets inscribed between two calls would otherwise
 * keep serving the `not_listed` computed when it had no inscription.
 */
function cacheKey(query: VenueQuery): string {
  return `${query.height}:${query.inscriptionId ?? ''}`;
}

/** Drop expired entries, then oldest-first until back under the cap. */
function evict(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // Map iterates in insertion order, so the first key is the oldest write.
  while (cache.size > MARKET_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Ask one venue, bounded by `VENUE_QUERY_BUDGET_MS`.
 *
 * Adapters are contractually non-throwing, but a broken one must not take a page
 * render with it, so the throw path is caught here too.
 */
async function queryVenue(venue: VenueAdapter, query: VenueQuery) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      venue.fetchBlockMarket(query),
      new Promise<{ ok: false; reason: string }>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, reason: 'venue query exceeded time budget' }),
          VENUE_QUERY_BUDGET_MS,
        );
      }),
    ]);
    return { venue, res };
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : 'venue adapter threw';
    return { venue, res: { ok: false as const, reason } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test seam — drops all cached market views. */
export function clearMarketCache(): void {
  cache.clear();
}

/** Cheapest live listing wins. Listings without a price rank last. */
function rankListings(listings: MarketListing[]): MarketListing[] {
  return [...listings].sort((a, b) => {
    if (a.priceSats === null && b.priceSats === null) return 0;
    if (a.priceSats === null) return 1;
    if (b.priceSats === null) return -1;
    return a.priceSats - b.priceSats;
  });
}

function emptyMarket(height: number, status: BlockMarket['status'], venuesQueried: string[] = []): BlockMarket {
  return {
    height,
    status,
    listing: null,
    listings: [],
    venuesQueried,
    errors: [],
    advisory: true,
    checkedAt: new Date().toISOString(),
  };
}

export interface GetBlockMarketOptions {
  /** Override the venue set. Tests inject mocks through here. */
  venues?: VenueAdapter[];
  /** Skip the cache read (the write still happens). */
  fresh?: boolean;
}

/**
 * Market view for one block. Never throws.
 *
 * @param query - Block height plus its inscription id, when it has one.
 */
export async function getBlockMarket(
  query: VenueQuery,
  opts: GetBlockMarketOptions = {}
): Promise<BlockMarket> {
  const { height } = query;
  const key = cacheKey(query);

  // Injected venues bypass the cache entirely: a shared cache keyed on the
  // query would let one test's mock venue answer another test's lookup.
  const usingDefaults = opts.venues === undefined;

  if (usingDefaults && !opts.fresh) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  const venues = opts.venues ?? resolveVenues();

  let result: BlockMarket;

  if (venues.length === 0) {
    result = emptyMarket(height, 'unconfigured');
  } else if (!query.inscriptionId) {
    // A block that was never inscribed cannot be listed on an ordinals venue.
    // Answering from that fact costs zero upstream calls and is not a guess.
    result = emptyMarket(height, 'not_listed', []);
  } else {
    const settled = await Promise.all(venues.map((venue) => queryVenue(venue, query)));

    const listings: MarketListing[] = [];
    const errors: Array<{ venue: string; reason: string }> = [];

    for (const { venue, res } of settled) {
      if (res.ok) {
        if (res.listing.listed) {
          // The link allowlist is enforced HERE, at the aggregation boundary,
          // not left to each adapter. Adapters are supposed to sanitize their
          // own URLs, but "every adapter remembers" is a convention, and this
          // value ends up in an href on a public page. Re-checking against the
          // venue's declared link hosts makes it a boundary instead.
          listings.push({ ...res.listing, url: sanitizeVenueUrl(res.listing.url, venue.linkHosts) });
        }
      } else {
        errors.push({ venue: venue.id, reason: res.reason });
      }
    }

    const ranked = rankListings(listings);
    const everyVenueFailed = errors.length === venues.length;

    result = {
      height,
      // "Everything we asked failed" is unavailable, not not-listed. Reporting
      // an outage as "no listings" would be a confident lie.
      status: ranked.length > 0 ? 'listed' : everyVenueFailed ? 'unavailable' : 'not_listed',
      listing: ranked[0] ?? null,
      listings: ranked,
      venuesQueried: venues.map((v) => v.id),
      errors,
      advisory: true,
      checkedAt: new Date().toISOString(),
    };
  }

  if (usingDefaults) {
    // Expiry measured from completion, not from entry: a venue that took four
    // seconds would otherwise have its answer expire four seconds early.
    const storedAt = Date.now();
    cache.set(key, { expiresAt: storedAt + MARKET_CACHE_TTL_MS, value: result });
    evict(storedAt);
  }

  return result;
}
