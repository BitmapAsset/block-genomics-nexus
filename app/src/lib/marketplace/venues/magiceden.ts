/**
 * Magic Eden venue adapter — the lane's first venue.
 *
 * ## What was verified, and what was not
 *
 * Probed live on 2026-08-20, unauthenticated:
 *
 *   - `api-mainnet.magiceden.dev/v2/ord/btc/*` → HTTP 503 "no healthy upstream"
 *     on every path tried, with and without an Authorization header. The `.dev`
 *     host that older integrations use no longer serves the ordinals API.
 *   - `api-mainnet.magiceden.us/v2/ord/btc/*` → HTTP 401, empty body, behind
 *     Kong. That is the live host, and it requires a key.
 *
 * So the base URL and the fact that a key is mandatory are verified. The
 * **response body shape below is not** — a 401 returns nothing to parse, and no
 * key was available to this work. The field names encode Magic Eden's long-
 * documented ordinals token shape (`tokens[].listed`, `listedPrice`, `listedAt`),
 * and the parser is written to survive being wrong about them: unknown or
 * missing fields degrade to `null`/`not listed` rather than throwing, and a
 * payload that is not the expected shape at all comes back as a clean
 * `{ ok: false }`.
 *
 * The consequence for an operator: setting `BG_MAGICEDEN_API_KEY` may surface
 * listings, or may surface "unavailable" if the shape has moved. It cannot break
 * the block page either way. First run against a real key should be treated as
 * the actual verification step, and `parseTokenPayload` is the one function to
 * adjust if the shape differs.
 */

import type { MarketListing, VenueAdapter, VenueQuery, VenueQueryResult } from '../types';
import { fetchVenueJson } from '../venue-fetch';
import { asRecord, sanitizeSats, sanitizeTimestamp, sanitizeVenueUrl } from '../normalize';

export const MAGICEDEN_ID = 'magiceden';
export const MAGICEDEN_NAME = 'Magic Eden';

/** Live ordinals API host. The `.dev` host is dead — see the file header. */
export const MAGICEDEN_API_HOST = 'api-mainnet.magiceden.us';
/** Human-facing UI host, the only place a rendered link may point. */
export const MAGICEDEN_LINK_HOST = 'magiceden.io';

const API_BASE = `https://${MAGICEDEN_API_HOST}/v2/ord/btc`;

/** Canonical item page for an inscription. */
function itemUrl(inscriptionId: string): string {
  return `https://${MAGICEDEN_LINK_HOST}/ordinals/item-details/${encodeURIComponent(inscriptionId)}`;
}

/**
 * Extract the token array from a `/tokens` response, or null if the payload is
 * not a token response at all.
 *
 * Handles both `{ tokens: [...] }` and a bare array, because the two are both
 * plausible and the cost of tolerating the other one is three lines.
 *
 * An **empty** array is a valid answer, not a failure, so it comes back as `[]`
 * rather than null — the two are different facts and the caller depends on the
 * difference.
 */
function tokenList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const wrapped = asRecord(body);
  if (wrapped && Array.isArray(wrapped.tokens)) return wrapped.tokens as unknown[];
  return null;
}

/**
 * Turn an untrusted token payload into a listing, or null if the payload was
 * not a token response.
 *
 * The distinction that matters: a venue returning **no token** for an
 * inscription means it does not index that bitmap, which is a confident "not
 * listed here". Only a payload we cannot recognise at all is an error. Treating
 * the first case as the second would put "marketplace unavailable" on every
 * block the venue has simply never seen — which is most of them.
 *
 * Within a token, fields are optional from our side: one that exists but
 * carries no usable price is reported as listed-without-price rather than
 * silently unlisted, so a venue-side omission looks like the venue bug it is.
 */
export function parseTokenPayload(body: unknown, inscriptionId: string): MarketListing | null {
  const list = tokenList(body);
  if (!list) return null;

  const base = {
    venue: MAGICEDEN_ID,
    venueName: MAGICEDEN_NAME,
    // The item URL is constructed from our own constant rather than read from
    // the payload: a venue-supplied link is an attacker-supplied link, and there
    // is no reason to accept one when the canonical form is derivable.
    url: sanitizeVenueUrl(itemUrl(inscriptionId), [MAGICEDEN_LINK_HOST]),
    lastSaleSats: null,
    lastSaleAt: null,
  };

  if (list.length === 0) {
    return { ...base, listed: false, priceSats: null };
  }

  const token = asRecord(list[0]);
  if (!token) return null;

  const listed = token.listed === true;
  return { ...base, listed, priceSats: listed ? sanitizeSats(token.listedPrice) : null };
}

/**
 * Best-effort last-sale enrichment.
 *
 * Split from the listing read and allowed to fail silently: last sale is a nice
 * decoration, and a second upstream call that comes back 500 should not turn a
 * good listing into an error. Returns nulls on any doubt.
 */
async function fetchLastSale(
  inscriptionId: string,
  headers: Record<string, string>
): Promise<{ lastSaleSats: number | null; lastSaleAt: string | null }> {
  const empty = { lastSaleSats: null, lastSaleAt: null };
  const url = `${API_BASE}/activities?tokenId=${encodeURIComponent(inscriptionId)}&kind=buying_broadcasted&limit=1`;

  const res = await fetchVenueJson(url, [MAGICEDEN_API_HOST], headers);
  if (!res.ok) return empty;

  const wrapped = asRecord(res.body);
  const list = Array.isArray(res.body)
    ? res.body
    : Array.isArray(wrapped?.activities)
      ? (wrapped!.activities as unknown[])
      : null;
  if (!list || list.length === 0) return empty;

  const activity = asRecord(list[0]);
  if (!activity) return empty;

  return {
    lastSaleSats: sanitizeSats(activity.listedPrice ?? activity.price ?? activity.amount),
    lastSaleAt: sanitizeTimestamp(activity.createdAt ?? activity.timestamp ?? activity.blockTime),
  };
}

/** Read the API key at call time so tests and redeploys see config changes. */
function apiKey(): string | null {
  const key = process.env.BG_MAGICEDEN_API_KEY?.trim();
  return key ? key : null;
}

export const magicEdenAdapter: VenueAdapter = {
  id: MAGICEDEN_ID,
  name: MAGICEDEN_NAME,
  apiHosts: [MAGICEDEN_API_HOST],
  linkHosts: [MAGICEDEN_LINK_HOST],

  isConfigured(): boolean {
    return apiKey() !== null;
  },

  async fetchBlockMarket(query: VenueQuery): Promise<VenueQueryResult> {
    const key = apiKey();
    if (!key) return { ok: false, reason: 'Magic Eden API key is not configured' };
    if (!query.inscriptionId) {
      return { ok: false, reason: 'block has no inscription id to look up' };
    }

    const headers = { authorization: `Bearer ${key}` };
    const url = `${API_BASE}/tokens?tokenIds=${encodeURIComponent(query.inscriptionId)}`;

    const res = await fetchVenueJson(url, [MAGICEDEN_API_HOST], headers);
    if (!res.ok) return { ok: false, reason: res.reason };

    const listing = parseTokenPayload(res.body, query.inscriptionId);
    if (!listing) return { ok: false, reason: 'venue returned no token record' };

    // Only chase a sale record for something actually on the market.
    if (listing.listed) {
      const sale = await fetchLastSale(query.inscriptionId, headers);
      listing.lastSaleSats = sale.lastSaleSats;
      listing.lastSaleAt = sale.lastSaleAt;
    }

    return { ok: true, listing };
  },
};
