/**
 * An in-memory stand-in for the `ApiRateLimit` upsert behind `prisma.$queryRaw`,
 * so suites can drive the real `rateLimitDurable` / `enforceRateLimit` without a
 * database. Same semantics as `__tests__/security/rate-limit-db-sim.test.ts`:
 * a new window starts at 1, a hit in the same window adds 1.
 *
 * Modes: `count` (default), `fail` (every hit rejects, as a database outage
 * would: the limiter then answers `{ allowed: true, count: 0 }`), and
 * `unlimited` (every hit is the first of its window).
 *
 * `$queryRaw` is a plain function, not a `jest.fn`, so a suite's
 * `jest.restoreAllMocks()` cannot strip its implementation between cases.
 */

export type LimiterMode = 'count' | 'fail' | 'unlimited';

export function memoryRateLimiter() {
  const state = new Map<string, { windowStart: number; count: number }>();
  let mode: LimiterMode = 'count';

  let calls = 0;
  const $queryRaw = async (_sql: TemplateStringsArray, key: string, windowStart: Date) => {
    calls++;
    if (mode === 'fail') throw new Error('limiter table unreachable');
    if (mode === 'unlimited') return [{ count: 1 }];
    const ws = windowStart.getTime();
    const cur = state.get(key);
    if (!cur || cur.windowStart !== ws) {
      state.set(key, { windowStart: ws, count: 1 });
      return [{ count: 1 }];
    }
    cur.count += 1;
    return [{ count: cur.count }];
  };

  return {
    $queryRaw,
    /** Limiter round trips since the last reset. */
    calls: () => calls,
    /** Hits recorded for `key` in the current window. */
    hits(key: string, windowMs = 60_000): number {
      const cur = state.get(key);
      const ws = Math.floor(Date.now() / windowMs) * windowMs;
      return cur && cur.windowStart === ws ? cur.count : 0;
    },
    /** Mark `key` as already holding `count` hits in the current window. */
    spend(key: string, count: number, windowMs = 60_000): void {
      state.set(key, { windowStart: Math.floor(Date.now() / windowMs) * windowMs, count });
    },
    setMode(next: LimiterMode): void {
      mode = next;
    },
    reset(): void {
      state.clear();
      mode = 'count';
      calls = 0;
    },
  };
}

export type MemoryRateLimiter = ReturnType<typeof memoryRateLimiter>;
