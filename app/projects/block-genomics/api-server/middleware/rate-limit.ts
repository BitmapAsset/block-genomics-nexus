// ============================================================================
// In-Memory Rate Limiter
// ============================================================================
// Sliding-window counter per IP. Entries auto-purge on access.
// For production, swap with Redis-backed rate limiting.
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import type { RateLimitEntry } from '../types.js';

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Human-readable name for error messages */
  name?: string;
}

/**
 * Create a rate-limiting middleware with the given config.
 * Each call creates an independent limiter with its own store.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();
  const { maxRequests, windowMs, name = 'rate-limit' } = config;

  // Periodic cleanup — every 60s purge expired entries
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);
  cleanup.unref(); // don't keep process alive

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const existing = store.get(ip);

    if (!existing || existing.resetAt <= now) {
      // Fresh window
      store.set(ip, { count: 1, resetAt: now + windowMs });
      setRateLimitHeaders(res, maxRequests, maxRequests - 1, now + windowMs);
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > maxRequests) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      setRateLimitHeaders(res, maxRequests, 0, existing.resetAt);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `Rate limit exceeded for ${name}. Try again in ${retryAfter}s.`,
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
      });
      return;
    }

    setRateLimitHeaders(res, maxRequests, maxRequests - existing.count, existing.resetAt);
    next();
  };
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number) {
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}

// Pre-configured limiters
export const challengeRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  name: 'challenge',
});

export const verifyRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
  name: 'verify',
});

export const generalRateLimiter = createRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  name: 'general',
});
