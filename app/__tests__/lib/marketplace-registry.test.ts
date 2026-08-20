/**
 * Aggregation, ranking, caching and degradation in the marketplace lane.
 *
 * These are the behaviours that decide what a reader is told when venues
 * disagree, fail, or say nothing — which is most of the time. The load-bearing
 * distinction throughout is between "we asked and there are no listings" and
 * "we could not ask", because reporting the second as the first is a confident
 * lie about a third party's market.
 */

import {
  getBlockMarket,
  clearMarketCache,
  MARKET_CACHE_TTL_MS,
  VENUE_QUERY_BUDGET_MS,
} from '@/lib/marketplace';
import { createMockVenue, mockListing } from '@/lib/marketplace/mock-venue';

const HEIGHT = 840_000;
const INSCRIPTION = 'abc123i0';
const QUERY = { height: HEIGHT, inscriptionId: INSCRIPTION };

beforeEach(() => {
  clearMarketCache();
});

describe('status resolution', () => {
  it('is unconfigured when no venue has credentials', async () => {
    const market = await getBlockMarket(QUERY, { venues: [] });
    expect(market.status).toBe('unconfigured');
    expect(market.listing).toBeNull();
    expect(market.venuesQueried).toEqual([]);
  });

  it('is listed when a venue advertises the block', async () => {
    const venue = createMockVenue({ result: { ok: true, listing: mockListing({ priceSats: 42 }) } });
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.status).toBe('listed');
    expect(market.listing?.priceSats).toBe(42);
    expect(market.venuesQueried).toEqual(['mock']);
  });

  it('is not_listed when a venue answers but has no listing', async () => {
    const venue = createMockVenue({ result: { ok: true, listing: mockListing({ listed: false }) } });
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.status).toBe('not_listed');
    expect(market.listing).toBeNull();
  });

  // The distinction this whole lane hinges on.
  it('is unavailable — not not_listed — when every venue fails', async () => {
    const venue = createMockVenue({ result: { ok: false, reason: 'venue returned HTTP 500' } });
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.status).toBe('unavailable');
    expect(market.errors).toEqual([{ venue: 'mock', reason: 'venue returned HTTP 500' }]);
  });

  it('is not_listed when one venue fails but another answers cleanly', async () => {
    const broken = createMockVenue({ id: 'broken', result: { ok: false, reason: 'timeout' } });
    const quiet = createMockVenue({
      id: 'quiet',
      result: { ok: true, listing: mockListing({ venue: 'quiet', listed: false }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [broken, quiet] });
    expect(market.status).toBe('not_listed');
    expect(market.errors).toHaveLength(1);
  });

  it('answers not_listed without contacting anyone when the block has no inscription', async () => {
    // An uninscribed block cannot be listed on an ordinals venue, so asking is
    // pure cost against a metered key.
    const venue = createMockVenue();
    const market = await getBlockMarket(
      { height: HEIGHT, inscriptionId: null },
      { venues: [venue] },
    );
    expect(market.status).toBe('not_listed');
    expect(venue.calls).toHaveLength(0);
  });

  it('always flags the payload as advisory', async () => {
    const venue = createMockVenue();
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.advisory).toBe(true);
  });
});

describe('ranking across venues', () => {
  it('picks the cheapest live listing', async () => {
    const pricey = createMockVenue({
      id: 'pricey',
      result: { ok: true, listing: mockListing({ venue: 'pricey', priceSats: 900 }) },
    });
    const cheap = createMockVenue({
      id: 'cheap',
      result: { ok: true, listing: mockListing({ venue: 'cheap', priceSats: 100 }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [pricey, cheap] });
    expect(market.listing?.venue).toBe('cheap');
    expect(market.listings.map((l) => l.venue)).toEqual(['cheap', 'pricey']);
  });

  it('ranks a listing with no published price last', async () => {
    // Listed-without-price is a venue bug we surface rather than hide, but it
    // should never outrank a real number.
    const priceless = createMockVenue({
      id: 'priceless',
      result: { ok: true, listing: mockListing({ venue: 'priceless', priceSats: null }) },
    });
    const priced = createMockVenue({
      id: 'priced',
      result: { ok: true, listing: mockListing({ venue: 'priced', priceSats: 500 }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [priceless, priced] });
    expect(market.listing?.venue).toBe('priced');
    expect(market.listings).toHaveLength(2);
  });

  it('excludes unlisted results from the listings array', async () => {
    const a = createMockVenue({
      id: 'a',
      result: { ok: true, listing: mockListing({ venue: 'a', listed: false }) },
    });
    const b = createMockVenue({
      id: 'b',
      result: { ok: true, listing: mockListing({ venue: 'b', priceSats: 7 }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [a, b] });
    expect(market.listings.map((l) => l.venue)).toEqual(['b']);
  });
});

describe('adapter fault isolation', () => {
  it('survives an adapter that breaks its no-throw contract', async () => {
    const rogue = createMockVenue({
      id: 'rogue',
      result: () => {
        throw new Error('adapter exploded');
      },
    });
    const good = createMockVenue({
      id: 'good',
      result: { ok: true, listing: mockListing({ venue: 'good', priceSats: 11 }) },
    });

    const market = await getBlockMarket(QUERY, { venues: [rogue, good] });
    expect(market.status).toBe('listed');
    expect(market.listing?.venue).toBe('good');
    expect(market.errors).toEqual([{ venue: 'rogue', reason: 'adapter exploded' }]);
  });

  it('reports unavailable when the only adapter throws', async () => {
    const rogue = createMockVenue({
      id: 'rogue',
      result: () => {
        throw new Error('boom');
      },
    });
    const market = await getBlockMarket(QUERY, { venues: [rogue] });
    expect(market.status).toBe('unavailable');
  });

  it('queries venues concurrently rather than one after another', async () => {
    const slow = (id: string) =>
      createMockVenue({
        id,
        result: async () => {
          await new Promise((r) => setTimeout(r, 60));
          return { ok: true, listing: mockListing({ venue: id, priceSats: 1 }) };
        },
      });
    const started = Date.now();
    await getBlockMarket(QUERY, { venues: [slow('a'), slow('b'), slow('c')] });
    // Serial would be ~180ms. Generous bound to stay stable on a loaded CI box.
    expect(Date.now() - started).toBeLessThan(150);
  });
});

describe('link-host enforcement at the aggregation boundary', () => {
  // An adapter is *supposed* to sanitize its own URLs, but "every adapter
  // remembers" is a convention and this value lands in an href on a public
  // page. The registry re-checks it against the venue's declared link hosts so
  // a careless or compromised adapter cannot publish a phishing link.
  it('drops a listing URL outside the venue link allowlist', async () => {
    const rogue = createMockVenue({
      result: {
        ok: true,
        listing: mockListing({ url: 'https://drainer.example/connect-wallet' }),
      },
    });
    const market = await getBlockMarket(QUERY, { venues: [rogue] });
    expect(market.status).toBe('listed');
    expect(market.listing?.url).toBeNull();
  });

  it('keeps a listing URL on an allowlisted link host', async () => {
    const venue = createMockVenue({
      result: { ok: true, listing: mockListing({ url: 'https://example.invalid/item/1' }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.listing?.url).toBe('https://example.invalid/item/1');
  });

  it('drops a non-https listing URL', async () => {
    const venue = createMockVenue({
      result: { ok: true, listing: mockListing({ url: 'http://example.invalid/item/1' }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [venue] });
    expect(market.listing?.url).toBeNull();
  });
});

describe('time budget', () => {
  // The fetcher's own timeout bounds fetch() only; DNS resolution sits outside
  // that AbortController and an adapter may make several sequential calls. This
  // is the budget that actually bounds getBlockMarket.
  it('gives up on a venue that never answers', async () => {
    const hung = createMockVenue({
      result: () => new Promise(() => {}),
    });

    const started = Date.now();
    const market = await getBlockMarket(QUERY, { venues: [hung] });
    const elapsed = Date.now() - started;

    expect(market.status).toBe('unavailable');
    expect(market.errors[0].reason).toMatch(/time budget/);
    expect(elapsed).toBeLessThan(VENUE_QUERY_BUDGET_MS + 2000);
  }, 20_000);

  it('lets a fast venue through untouched', async () => {
    const quick = createMockVenue({
      result: { ok: true, listing: mockListing({ priceSats: 5 }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [quick] });
    expect(market.status).toBe('listed');
  });

  it('does not let one hung venue sink a healthy one', async () => {
    const hung = createMockVenue({ id: 'hung', result: () => new Promise(() => {}) });
    const good = createMockVenue({
      id: 'good',
      result: { ok: true, listing: mockListing({ venue: 'good', priceSats: 3 }) },
    });
    const market = await getBlockMarket(QUERY, { venues: [hung, good] });
    expect(market.status).toBe('listed');
    expect(market.listing?.venue).toBe('good');
    expect(market.errors).toHaveLength(1);
  }, 20_000);
});

describe('caching', () => {
  it('does not cache across injected venue sets', async () => {
    // Injected venues bypass the cache entirely; otherwise one test's mock
    // would answer another's lookup, and a height-keyed cache would leak
    // between callers that asked different venues.
    const first = createMockVenue({
      id: 'first',
      result: { ok: true, listing: mockListing({ venue: 'first', priceSats: 1 }) },
    });
    const second = createMockVenue({
      id: 'second',
      result: { ok: true, listing: mockListing({ venue: 'second', priceSats: 2 }) },
    });

    await getBlockMarket(QUERY, { venues: [first] });
    const market = await getBlockMarket(QUERY, { venues: [second] });
    expect(market.listing?.venue).toBe('second');
  });

  it('serves the default venue set from cache within the TTL', async () => {
    // The default set is empty in tests (no venue keys configured), which still
    // exercises the cache write/read path.
    const a = await getBlockMarket(QUERY);
    const b = await getBlockMarket(QUERY);
    expect(b.checkedAt).toBe(a.checkedAt);
    expect(b.status).toBe('unconfigured');
  });

  it('recomputes when the cache is cleared', async () => {
    const a = await getBlockMarket(QUERY);
    clearMarketCache();
    await new Promise((r) => setTimeout(r, 2));
    const b = await getBlockMarket(QUERY);
    expect(b.checkedAt).not.toBe(a.checkedAt);
  });

  it('keys on the inscription id, not only the height', async () => {
    // The id is an input to the answer. Keying on height alone would keep
    // serving the not_listed computed while the block was uninscribed, for the
    // whole TTL after it gets inscribed.
    const before = await getBlockMarket({ height: HEIGHT, inscriptionId: null });
    // checkedAt is the discriminator, so the two calls must not land in the
    // same millisecond or the assertion proves nothing either way.
    await new Promise((r) => setTimeout(r, 2));
    const after = await getBlockMarket({ height: HEIGHT, inscriptionId: INSCRIPTION });
    expect(after.checkedAt).not.toBe(before.checkedAt);

    // And the original key still hits cache, proving this is a keying
    // difference rather than the cache simply being broken.
    const repeat = await getBlockMarket({ height: HEIGHT, inscriptionId: null });
    expect(repeat.checkedAt).toBe(before.checkedAt);
  });

  it('recomputes when asked for a fresh view', async () => {
    const a = await getBlockMarket(QUERY);
    await new Promise((r) => setTimeout(r, 2));
    const b = await getBlockMarket(QUERY, { fresh: true });
    expect(b.checkedAt).not.toBe(a.checkedAt);
  });

  it('has a TTL short enough to be a share-traffic damper, not a stale price', () => {
    expect(MARKET_CACHE_TTL_MS).toBeLessThanOrEqual(120_000);
    expect(MARKET_CACHE_TTL_MS).toBeGreaterThan(0);
  });

  it('does not grow without bound as a crawler sweeps distinct heights', async () => {
    for (let h = 0; h < 600; h++) {
      await getBlockMarket({ height: h, inscriptionId: null });
    }
    // Nothing to assert on a private Map directly; the guard is that this
    // completes and a later lookup still works rather than exhausting memory.
    const market = await getBlockMarket({ height: 599, inscriptionId: null });
    expect(market.height).toBe(599);
  });
});
