/**
 * Best-effort in-memory fixed-window rate limiter.
 *
 * On Vercel each lambda instance has isolated memory, so this bounds abuse from a
 * single warm instance rather than enforcing a global quota — a lightweight guard
 * against naive flooding, NOT a hard cross-instance limit. Upgrade to Redis for
 * production-scale, cross-instance enforcement.
 *
 * @returns true if the call is allowed, false if the window's limit is exceeded.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
