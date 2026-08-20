/**
 * A scriptable in-memory venue.
 *
 * Exists because the real venue requires a paid API key, so every test of the
 * lane's aggregation, caching, ranking and degradation logic would otherwise be
 * a test of a fetch mock. This adapter lets those tests state what a venue said
 * and assert on what the lane did with it.
 *
 * It is never auto-registered. `resolveVenues()` wires the real registry and has
 * no reference to this file; tests inject it explicitly. That is deliberate —
 * an env flag that swaps in fake market data is a foot-gun pointed at
 * production, and this lane already has a well-defined "no venue configured"
 * state that is the honest thing to show when nothing is wired up.
 */

import type { MarketListing, VenueAdapter, VenueQuery, VenueQueryResult } from './types';

export interface MockVenueOptions {
  id?: string;
  name?: string;
  configured?: boolean;
  /** Fixed result, or a function of the query. */
  result?: VenueQueryResult | ((query: VenueQuery) => VenueQueryResult | Promise<VenueQueryResult>);
}

/** A listing with sane defaults, overridable per field. */
export function mockListing(over: Partial<MarketListing> = {}): MarketListing {
  return {
    venue: 'mock',
    venueName: 'Mock Venue',
    listed: true,
    priceSats: 5_000_000,
    url: 'https://example.invalid/item',
    lastSaleSats: null,
    lastSaleAt: null,
    ...over,
  };
}

/** Build a venue adapter that returns whatever the test tells it to. */
export function createMockVenue(opts: MockVenueOptions = {}): VenueAdapter & { calls: VenueQuery[] } {
  const id = opts.id ?? 'mock';
  const calls: VenueQuery[] = [];

  return {
    id,
    name: opts.name ?? 'Mock Venue',
    apiHosts: ['api.example.invalid'],
    linkHosts: ['example.invalid'],
    calls,
    isConfigured: () => opts.configured !== false,
    async fetchBlockMarket(query: VenueQuery): Promise<VenueQueryResult> {
      calls.push(query);
      const r = opts.result;
      if (typeof r === 'function') return r(query);
      if (r) return r;
      return { ok: true, listing: mockListing({ venue: id, venueName: opts.name ?? 'Mock Venue' }) };
    },
  };
}
