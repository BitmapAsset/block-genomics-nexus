/**
 * Canonical handle (username) normalization + validation.
 *
 * Handles are GLOBALLY unique across both the `User.handle` and
 * `BlockProfile.handle` namespaces. The stored value is always the normalized
 * (lowercase, trimmed) form, which is also the unique key — so the DB `@unique`
 * constraints enforce case-insensitive uniqueness for free.
 *
 * Use `normalizeHandle` on EVERY read and write path before touching the DB so
 * that lookups and uniqueness checks agree. Mismatched normalization between
 * write paths is what previously let differently-cased handles slip past the
 * unique constraints and become unreachable via lowercase lookups.
 */

export const HANDLE_MIN = 1;
export const HANDLE_MAX = 30;

// Canonical charset: lowercase letters, digits, underscore. Length 1..30.
export const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

export const HANDLE_ERROR =
  'Handle can only contain lowercase letters, numbers, and underscores (max 30 chars)';

/**
 * Normalize a raw handle into its canonical, storable form:
 * trim surrounding whitespace, lowercase, and map `-` to `_`.
 * Returns '' for nullish input so callers can treat it as "no handle".
 */
export function normalizeHandle(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/-/g, '_');
}

/**
 * Validate an ALREADY-normalized handle against the canonical charset/length.
 * Pass the output of `normalizeHandle` here.
 */
export function isValidHandle(normalized: string): boolean {
  return HANDLE_RE.test(normalized);
}
