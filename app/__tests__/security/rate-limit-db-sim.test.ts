/**
 * ISOLATED SIMULATION — durable cross-instance rate limiter (lib/rate-limit-db.ts).
 *
 * The production atomicity lives in a single Postgres `INSERT … ON CONFLICT DO
 * UPDATE` (row-lock serialized). These tests inject an in-memory counter that
 * mirrors that exact upsert semantics (reset on a new window, else increment) so
 * we can prove the DECISION layer without a database — the same testing approach
 * the challenge-consume suite uses for `updateMany` atomicity.
 *
 * Proves: limit boundary, window rollover reset, concurrent hits admit EXACTLY
 * `limit` with no lost updates/over-admission, per-key isolation, and fail-open on
 * a limiter-infra error.
 */

// Mock prisma so importing the module never constructs a real client / connects.
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

import {
  rateLimitDurable,
  windowStartFor,
  clientIpFrom,
  type RateCounter,
} from '@/lib/rate-limit-db';

const WINDOW = 60_000;

/** In-memory atomic counter mirroring the SQL upsert (new window → 1, else +1). */
function memoryCounter() {
  const state = new Map<string, { windowStart: number; count: number }>();
  const counter: RateCounter = {
    async hit(key, windowStart) {
      const cur = state.get(key);
      if (!cur || cur.windowStart !== windowStart) {
        state.set(key, { windowStart, count: 1 });
        return 1;
      }
      cur.count += 1;
      return cur.count;
    },
  };
  return { counter, state };
}

describe('SIM: durable rate limiter', () => {
  it('allows up to the limit, then 429s within the same window', async () => {
    const { counter } = memoryCounter();
    const now = 1_000_000;
    const LIMIT = 3;
    const seq = [];
    for (let i = 0; i < 5; i++) {
      seq.push(await rateLimitDurable('k', LIMIT, WINDOW, { now, counter }));
    }
    expect(seq.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    // Post-increment counts are exact and monotonic.
    expect(seq.map((r) => r.count)).toEqual([1, 2, 3, 4, 5]);
    // A blocked result advertises a positive Retry-After.
    expect(seq[3].retryAfterSec).toBeGreaterThan(0);
    expect(seq[3].limit).toBe(LIMIT);
  });

  it('resets the count when the window rolls over', async () => {
    const { counter } = memoryCounter();
    const base = 1_000_000;
    // Exhaust a limit-of-1 window.
    const first = await rateLimitDurable('k', 1, WINDOW, { now: base, counter });
    expect(first.allowed).toBe(true);
    // A second hit later in the SAME window is blocked.
    const sameWindow = await rateLimitDurable('k', 1, WINDOW, { now: base + 500, counter });
    expect(sameWindow.allowed).toBe(false);
    // Advancing into the NEXT window resets the counter → allowed again.
    const nextWindow = await rateLimitDurable('k', 1, WINDOW, { now: base + WINDOW, counter });
    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.count).toBe(1);
  });

  it('admits EXACTLY the limit under concurrent hits (no over-admit, no lost updates)', async () => {
    const { counter, state } = memoryCounter();
    const now = 2_000_000;
    const LIMIT = 10;
    const N = 50;
    const settled = await Promise.all(
      Array.from({ length: N }, () => rateLimitDurable('burst', LIMIT, WINDOW, { now, counter }))
    );
    const allowed = settled.filter((r) => r.allowed).length;
    expect(allowed).toBe(LIMIT); // never more than the limit slips through
    // Every concurrent hit was counted exactly once — the atomic counter lost none.
    expect(state.get('burst')!.count).toBe(N);
  });

  it('keys are independent — one key hitting its limit does not affect another', async () => {
    const { counter } = memoryCounter();
    const now = 3_000_000;
    await rateLimitDurable('a', 1, WINDOW, { now, counter });
    const aBlocked = await rateLimitDurable('a', 1, WINDOW, { now, counter });
    const bOk = await rateLimitDurable('b', 1, WINDOW, { now, counter });
    expect(aBlocked.allowed).toBe(false);
    expect(bOk.allowed).toBe(true);
  });

  it('FAILS OPEN when the counter (DB) throws', async () => {
    const throwing: RateCounter = {
      hit: async () => {
        throw new Error('relation "ApiRateLimit" does not exist');
      },
    };
    const r = await rateLimitDurable('k', 1, WINDOW, { now: 1, counter: throwing });
    expect(r.allowed).toBe(true); // a limiter-infra error must never block real traffic
    expect(r.count).toBe(0);
  });
});

describe('SIM: rate-limit helpers', () => {
  it('windowStartFor buckets timestamps to fixed epoch-aligned windows', () => {
    expect(windowStartFor(1_000_000, WINDOW)).toBe(960_000);
    expect(windowStartFor(1_000_500, WINDOW)).toBe(960_000); // same window
    expect(windowStartFor(1_060_000, WINDOW)).toBe(1_020_000); // next window
  });

  it('clientIpFrom takes the first x-forwarded-for hop, falls back to x-real-ip, else "unknown"', () => {
    const withXff = { headers: { get: (n: string) => (n === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null) } };
    expect(clientIpFrom(withXff)).toBe('1.2.3.4');
    const withReal = {
      headers: { get: (n: string) => (n === 'x-real-ip' ? '9.9.9.9' : null) },
    };
    expect(clientIpFrom(withReal)).toBe('9.9.9.9');
    const none = { headers: { get: () => null } };
    expect(clientIpFrom(none)).toBe('unknown');
  });
});
