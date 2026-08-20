/**
 * One-line durable rate limiting for API routes.
 *
 * Background: only a handful of routes carried any limit, and `/mcp` used the
 * in-memory limiter — which on Vercel bounds a single warm lambda, not the
 * fleet. Ten instances meant ten times the advertised ceiling, and a cold start
 * reset the counter to zero. This wraps the Postgres-backed limiter
 * (`rate-limit-db.ts`) so a route gains a real, cross-instance limit in one call.
 *
 * WHY POSTGRES: it is the only durable store this app already owns. Redis /
 * Upstash / Vercel KV would be a better fit for pure counters — cheaper writes,
 * native TTL — but every one of them is a new paid dependency, which is not ours
 * to add. The tradeoff we accept: each limited request costs one indexed upsert
 * on the primary. That is real load, so limits here are deliberately generous
 * (abuse control, not fine-grained quota) and windows are coarse. If limiter
 * write volume ever shows up in DB metrics, moving `ApiRateLimit` to Redis is a
 * drop-in swap behind the `RateCounter` seam — no route changes.
 *
 * FAIL-OPEN, inherited from the durable limiter: a limiter outage admits the
 * request. These are public reads; the auth gates (challenge consume, BIP-322,
 * ownership) are elsewhere and fail CLOSED. Availability wins here, security
 * wins there.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { rateLimitDurable, clientIpFrom, type RateCounter, type RateLimitResult } from '@/lib/rate-limit-db';
import { sandboxKeyFromHeaders } from '@/lib/sandbox-tier';
import { looksLikeSessionToken, sessionTokenFromHeaders } from '@/lib/verified-sessions';

/** Default ceiling for an anonymous public read, per identity, per minute. */
export const PUBLIC_READ_LIMIT = 120;
export const PUBLIC_READ_WINDOW_MS = 60_000;

/**
 * Ceiling for an authenticated world write (create / update / delete), per
 * identity, per minute.
 *
 * Lower than the public read ceiling because each of these costs a live indexer
 * call before it costs a database write, so an unlimited caller could turn our
 * ownership gate into a request amplifier pointed at ordinals.com. Still well
 * above a human building in the editor, who batches.
 */
export const WORLD_WRITE_LIMIT = 60;

/** Batch writes carry up to 100 sub-ops each, so they get a tighter ceiling. */
export const WORLD_BATCH_LIMIT = 20;

/**
 * Ceiling for an experience write (register / update / remove), per identity,
 * per minute.
 *
 * Tighter than a world write because an experience write costs strictly more
 * than one: a live indexer call for the ownership gate, AND an outbound probe to
 * an owner-supplied host. That second cost is the reason for the lower number —
 * without it, our registry becomes a request amplifier aimed at a third party of
 * the caller's choosing. Still far above any real operator, who registers an
 * experience once and edits it rarely.
 */
export const EXPERIENCE_WRITE_LIMIT = 20;

/**
 * Ceiling for creating an estate, per identity, per minute. Same amplification
 * concern as a world write — one live indexer call per attempt — against a
 * surface a real owner touches a handful of times, so it sits at the tighter end.
 */
export const ESTATE_WRITE_LIMIT = 20;

/**
 * Ceiling for the public integrity-verify route, per identity, per minute.
 *
 * The local half is pure computation, but `?remote=1` makes an outbound fetch,
 * so this shares the amplification concern above and is limited accordingly.
 */
export const EXPERIENCE_VERIFY_LIMIT = 30;

/** Anything exposing a `headers.get` — NextRequest, Request, or a test stub. */
export type RateLimitedRequest = { headers: { get(name: string): string | null } };

export interface RateLimitOptions {
  /** Route-specific name so different routes get independent buckets. */
  bucket: string;
  limit?: number;
  windowMs?: number;
  now?: number;
  counter?: RateCounter;
}

/**
 * Identity used for keying, most specific first.
 *
 * Credential-keyed beats IP-keyed: a whole office behind one NAT should not
 * share a bucket, and a credential is a stronger identity than a spoofable
 * `x-forwarded-for`. Credentials are hashed, never keyed in the clear — limiter
 * rows are not a place to store live secrets.
 */
export function rateLimitIdentity(req: RateLimitedRequest): string {
  const headers = headersOf(req);

  const session = sessionTokenFromHeaders(headers);
  if (looksLikeSessionToken(session)) return `vfy:${fingerprint(session as string)}`;

  const sandbox = sandboxKeyFromHeaders(headers);
  if (sandbox) return `sbx:${fingerprint(sandbox)}`;

  return `ip:${clientIpFrom({ headers })}`;
}

/**
 * A readable header bag for any request-ish value.
 *
 * This wrapper sits in front of 55 routes, so it must never itself be the reason
 * one of them 500s. A request without a usable header bag degrades to "no
 * headers" — the caller is then keyed by the anonymous fallback — rather than
 * throwing. Same fail-open posture as the limiter it wraps: the real auth gates
 * are elsewhere and fail closed.
 */
function headersOf(req: RateLimitedRequest): { get(name: string): string | null } {
  const get = req?.headers?.get;
  if (typeof get !== 'function') return { get: () => null };
  return { get: (name: string) => req.headers.get(name) };
}

/** Truncated SHA-256 of a credential — enough to key a bucket, useless if the table leaks. */
function fingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32);
}

/** Standard advertisement headers so callers can back off before being blocked. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.limit - result.count)),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
  };
}

export interface RateLimitOutcome {
  /** Non-null when the request must be short-circuited. */
  response: NextResponse | null;
  /** Headers to merge into the route's own response. */
  headers: Record<string, string>;
}

/**
 * Charge one request against `bucket` and decide whether it may proceed.
 *
 * @example
 * const rl = await enforceRateLimit(req, { bucket: 'stats' });
 * if (rl.response) return rl.response;
 * return success(data, 200, rl.headers);
 */
export async function enforceRateLimit(
  req: RateLimitedRequest,
  opts: RateLimitOptions
): Promise<RateLimitOutcome> {
  const limit = opts.limit ?? PUBLIC_READ_LIMIT;
  const windowMs = opts.windowMs ?? PUBLIC_READ_WINDOW_MS;

  const result = await rateLimitDurable(`${opts.bucket}:${rateLimitIdentity(req)}`, limit, windowMs, {
    now: opts.now,
    counter: opts.counter,
  });

  const headers = rateLimitHeaders(result);

  if (!result.allowed) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded — ${limit} requests per ${Math.round(windowMs / 1000)}s. Retry in ${result.retryAfterSec}s.`,
          code: 'rate_limited',
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(result.retryAfterSec),
            'Cache-Control': 'no-store',
            // Anonymous and credentialed callers get separate buckets, so a
            // shared CDN must not serve one caller's 429 to another.
            Vary: 'Authorization, X-API-Key, X-BG-Session',
          },
        }
      ),
      headers,
    };
  }

  return { response: null, headers };
}
