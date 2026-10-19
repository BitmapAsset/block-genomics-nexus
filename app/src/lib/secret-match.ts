import crypto from 'crypto';

/**
 * Constant-time secret check for cron and admin routes. Both sides are hashed
 * first, so timingSafeEqual always compares two 32-byte digests and the length
 * of the real secret never shows up in the timing.
 *
 * Fails closed: an unset or empty secret, or a missing / non-string value,
 * never matches.
 */
export function secretMatches(provided: unknown, secret: string | undefined): boolean {
  if (typeof provided !== 'string' || !provided || !secret) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
