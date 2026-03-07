/**
 * Block Genomics — Rate Limiting Middleware
 *
 * Sliding-window rate limiter using in-memory storage.
 * For production, swap to Redis-backed sliding window.
 *
 * @module middleware/rate-limit
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/** Thrown when a rate limit is exceeded. */
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Window {
  timestamps: number[];
  lastCleanup: number;
}

const windows = new Map<string, Window>();

const MAX_KEYS = 10_000; // cap memory — evict oldest when exceeded

// Periodic cleanup: every 5 min, drop windows older than 10 min
const CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;
const WINDOW_MAX_AGE_MS = 10 * 60 * 1_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MAX_AGE_MS;
    for (const [key, win] of windows) {
      if (win.lastCleanup < cutoff) {
        windows.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check (and consume) a rate limit for the given key.
 *
 * If the limit is exceeded, throws `RateLimitError`.
 *
 * @param key     - Unique key (e.g. `"challenge:192.168.1.1"`).
 * @param options - Rate limit configuration.
 * @throws {RateLimitError} If the rate limit is exceeded.
 *
 * @example
 * ```ts
 * checkRateLimit(`challenge:${ip}`, { maxRequests: 10, windowMs: 60_000 });
 * ```
 */
export function checkRateLimit(key: string, options: RateLimitOptions): void {
  ensureCleanup();

  const now = Date.now();
  const windowStart = now - options.windowMs;

  let win = windows.get(key);
  if (!win) {
    // Evict oldest if at capacity
    if (windows.size >= MAX_KEYS) {
      const firstKey = windows.keys().next().value;
      if (firstKey !== undefined) windows.delete(firstKey);
    }
    win = { timestamps: [], lastCleanup: now };
    windows.set(key, win);
  }

  // Prune timestamps outside current window
  win.timestamps = win.timestamps.filter((t) => t > windowStart);
  win.lastCleanup = now;

  if (win.timestamps.length >= options.maxRequests) {
    // Calculate when the oldest request in the window expires
    const oldestInWindow = win.timestamps[0];
    const retryAfterMs = oldestInWindow + options.windowMs - now;
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${Math.ceil(retryAfterMs / 1_000)}s`,
      retryAfterMs,
    );
  }

  win.timestamps.push(now);
}

/**
 * Get remaining requests for a key within its window.
 *
 * @param key     - Rate limit key.
 * @param options - Rate limit configuration.
 * @returns Object with `remaining` and `resetMs`.
 */
export function getRateLimitInfo(
  key: string,
  options: RateLimitOptions,
): { remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const win = windows.get(key);

  if (!win) {
    return { remaining: options.maxRequests, resetMs: options.windowMs };
  }

  const active = win.timestamps.filter((t) => t > windowStart);
  const remaining = Math.max(0, options.maxRequests - active.length);
  const resetMs =
    active.length > 0 ? active[0] + options.windowMs - now : options.windowMs;

  return { remaining, resetMs: Math.max(0, resetMs) };
}

/**
 * Reset rate limit state for a specific key (useful for testing).
 *
 * @param key - Rate limit key to reset.
 */
export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/**
 * Default rate limit presets for different endpoint categories.
 */
export const RATE_LIMITS = {
  /** Challenge generation: 10 req / min */
  challenge: { maxRequests: 10, windowMs: 60_000 } as RateLimitOptions,
  /** Verification submission: 5 req / min */
  verify: { maxRequests: 5, windowMs: 60_000 } as RateLimitOptions,
  /** Read endpoints (agent, block): 30 req / min */
  read: { maxRequests: 30, windowMs: 60_000 } as RateLimitOptions,
  /** Search: 20 req / min */
  search: { maxRequests: 20, windowMs: 60_000 } as RateLimitOptions,
  /** Badge (image serve): 60 req / min */
  badge: { maxRequests: 60, windowMs: 60_000 } as RateLimitOptions,
  /** Leaderboard: 15 req / min */
  leaderboard: { maxRequests: 15, windowMs: 60_000 } as RateLimitOptions,
} as const;
