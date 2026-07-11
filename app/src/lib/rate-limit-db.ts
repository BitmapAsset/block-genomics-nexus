/**
 * Durable, cross-instance fixed-window rate limiter backed by Postgres.
 *
 * The in-memory limiter (`rate-limit.ts`) only bounds a single warm Vercel lambda
 * — each instance has isolated memory, so it is not a global quota. This limiter
 * enforces a GLOBAL window count via a single atomic statement
 * (`INSERT ... ON CONFLICT DO UPDATE`), so concurrent hits across every lambda
 * serialize on the row lock and cannot over-admit.
 *
 * FAIL-OPEN by design: this is defense-in-depth against flooding, NOT the auth
 * gate (challenge consume, BIP-322 verify, and ownership checks remain the real
 * gates). If the limiter table is missing or the DB errors, we ALLOW the request
 * and warn — a limiter-infra problem must never take down challenge issuance or
 * token management.
 */

import prisma from '@/lib/prisma';

export interface RateLimitResult {
  allowed: boolean;
  /** Hits recorded so far in the current window (post-increment). */
  count: number;
  limit: number;
  /** Epoch ms at which the current window rolls over. */
  resetAt: number;
  /** Seconds until the window resets — suitable for a `Retry-After` header. */
  retryAfterSec: number;
}

/**
 * The atomic counter seam. The production impl hits Postgres; tests inject an
 * in-memory counter that mirrors the same atomic upsert semantics.
 */
export interface RateCounter {
  /** Atomically record one hit for (key, window) and return the post-increment count. */
  hit(key: string, windowStartMs: number, windowMs: number): Promise<number>;
}

/** Fixed-window bucket start (epoch-aligned) for `nowMs`. */
export function windowStartFor(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Postgres-backed atomic counter. One statement:
 *   - first hit in a window INSERTs count=1;
 *   - subsequent hits in the SAME window increment (row-locked, no lost updates);
 *   - the first hit of a NEW window resets count to 1 (the CASE on windowStart).
 * `RETURNING "count"` gives the caller the exact post-increment value.
 */
export const prismaRateCounter: RateCounter = {
  async hit(key, windowStartMs, windowMs) {
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + windowMs);
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "ApiRateLimit" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "ApiRateLimit"."windowStart" = ${windowStart}
                       THEN "ApiRateLimit"."count" + 1 ELSE 1 END,
        "windowStart" = ${windowStart},
        "expiresAt" = ${expiresAt}
      RETURNING "count";
    `;
    return Number(rows[0]?.count ?? 1);
  },
};

/**
 * Record one hit against `key` and decide if it is within `limit` per `windowMs`.
 * @param opts.now      Override the clock (tests).
 * @param opts.counter  Override the atomic counter seam (tests).
 */
export async function rateLimitDurable(
  key: string,
  limit: number,
  windowMs: number,
  opts: { now?: number; counter?: RateCounter } = {}
): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();
  const counter = opts.counter ?? prismaRateCounter;
  const windowStart = windowStartFor(now, windowMs);
  const resetAt = windowStart + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  try {
    const count = await counter.hit(key, windowStart, windowMs);
    return { allowed: count <= limit, count, limit, resetAt, retryAfterSec };
  } catch (e: unknown) {
    // FAIL-OPEN — a limiter-infra failure must not block legitimate traffic.
    console.warn('[rate-limit-db] fail-open:', e instanceof Error ? e.message : String(e));
    return { allowed: true, count: 0, limit, resetAt, retryAfterSec };
  }
}

/** Best-effort client IP for keying. Vercel sets `x-forwarded-for`. */
export function clientIpFrom(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Delete rate-limit rows whose window has already expired. Best-effort housekeeping. */
export async function cleanupRateLimits(): Promise<void> {
  try {
    await prisma.apiRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* best-effort */
  }
}
