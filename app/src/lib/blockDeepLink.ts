/**
 * Deep-link plumbing for the Nexus map.
 *
 * The map is a canvas app, so the browser URL is the only thing a user can copy
 * to point someone else at a specific block. These helpers are pure so the
 * param round-trip can be tested without a DOM.
 */

import { MAX_BLOCK_HEIGHT, parseBlockHeight } from '@/lib/block-height';

export const NEXUS_PATH = '/nexus';
export const BLOCK_PARAM = 'block';

export { MAX_BLOCK_HEIGHT };

/**
 * Parse a `?block=` value into a height. Strict on purpose: `parseInt` would
 * happily turn `"840000junk"` into a valid-looking height.
 */
export function parseBlockParam(raw: string | null | undefined): number | undefined {
  return parseBlockHeight(raw) ?? undefined;
}

/**
 * Set or clear `block` on an existing query string, preserving every other
 * param. Returns a leading-`?` search string, or `''` when nothing is left.
 */
export function applyBlockParam(search: string, height: number | null | undefined): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (height === null || height === undefined) {
    params.delete(BLOCK_PARAM);
  } else {
    params.set(BLOCK_PARAM, String(height));
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}

/** Canonical shareable link for a block. `/block/{height}` redirects to the map. */
export function buildBlockShareUrl(height: number, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/block/${height}`;
}
