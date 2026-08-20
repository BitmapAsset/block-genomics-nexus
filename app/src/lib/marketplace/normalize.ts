/**
 * Normalizers for untrusted venue payloads.
 *
 * Everything a venue returns is attacker-shaped until proven otherwise. A venue
 * is a third party we do not run; a compromised or merely buggy one can hand us
 * a price of `-1`, `1e308`, `"free"`, or a listing URL pointing at a phishing
 * clone. None of that may reach the page, so every scalar the lane surfaces
 * passes through here first and becomes either a value in a known-sane range or
 * `null`.
 *
 * `null` over a thrown error on purpose: one nonsense field should cost us that
 * field, not the whole market panel.
 */

import { MAX_PLAUSIBLE_SATS } from './types';
import { hostIsAllowed } from './venue-fetch';

/**
 * Coerce an untrusted value into a plausible sats amount, or null.
 *
 * Rejects: non-numeric, NaN, ±Infinity, negative, and anything at or above the
 * 21M BTC supply cap — a block priced above every satoshi that will ever exist
 * is upstream corruption, and rendering it would be worse than rendering
 * nothing. Numeric strings are accepted because venues are inconsistent about
 * quoting large integers.
 *
 * Zero is rejected too, which is the non-obvious one: it is finite and
 * non-negative, so a naive range check lets it through, but no venue means "this
 * bitmap is free". In practice a zero is a sentinel for an absent price or an
 * uninitialised field, and surfacing it would render a block as costing nothing.
 */
export function sanitizeSats(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else {
    return null;
  }

  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n >= MAX_PLAUSIBLE_SATS) return null;

  // Sats are indivisible; venues occasionally emit floats from internal decimal
  // math. Round rather than reject — the sub-sat noise is theirs, not a signal.
  return Math.round(n);
}

/**
 * Coerce an untrusted value into an ISO-8601 timestamp string, or null.
 *
 * Accepts a millisecond epoch number or a parseable date string. Rejects dates
 * outside a sane window — a "last sale" in 1970 or the year 5000 is a venue
 * serialising a zero or a sentinel, not a fact about this block.
 */
export function sanitizeTimestamp(value: unknown): string | null {
  let d: Date;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: seconds-since-epoch values are ~1e9, milliseconds ~1e12.
    d = new Date(value < 1e11 ? value * 1000 : value);
  } else if (typeof value === 'string' && value.trim() !== '') {
    d = new Date(value);
  } else {
    return null;
  }

  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  // Bitcoin genesis (2009) to a decade out. Anything else is a sentinel.
  const MIN = Date.UTC(2009, 0, 1);
  const MAX = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  if (ms < MIN || ms > MAX) return null;

  return d.toISOString();
}

/**
 * Coerce an untrusted listing URL into a safe outbound link, or null.
 *
 * This one is a security control, not a tidiness pass. The value lands in an
 * `href` a human is invited to click, so a venue that returns
 * `https://magiceden-support.example/connect-wallet` — or `javascript:` — would
 * be using our page to launder a phishing link. Same allowlist the fetcher uses:
 * if we would not make a request to that host, we will not link to it either.
 */
export function sanitizeVenueUrl(value: unknown, allowedHosts: readonly string[]): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // A real venue serves its UI on 443. A non-default port on an otherwise
  // allowlisted host is someone running something else there.
  if (url.port !== '') return null;
  if (!hostIsAllowed(url.hostname, allowedHosts)) return null;

  return url.toString();
}

/** Narrow an untrusted value to a plain JSON object, or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
