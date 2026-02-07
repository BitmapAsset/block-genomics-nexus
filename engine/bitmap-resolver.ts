/**
 * Block Genomics — Multi‑Indexer Bitmap Resolver
 *
 * Resolves bitmap inscriptions for a given Bitcoin / Ordinals address
 * using multiple indexer APIs with automatic fallback:
 *
 *   1. **Hiro API** (api.hiro.so) — primary
 *   2. **ord.io API** — fallback
 *
 * All responses are validated against the canonical bitmap pattern
 * `^\d+\.bitmap$` before being returned.
 *
 * @module bitmap-resolver
 */

import type { Bitmap, BitmapResolutionResult, OwnershipVerification } from './types';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const BITMAP_PATTERN = /^\d+\.bitmap$/;

const HIRO_BASE = 'https://api.hiro.so/ordinals/v1';
const ORDIO_BASE = 'https://api.ord.io/v1';

/** Default fetch timeout (ms). */
const TIMEOUT_MS = 15_000;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** Fetch with timeout + JSON parse. Returns null on any failure. */
async function safeFetch<T>(url: string, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timer);

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Validate and parse a bitmap content string.
 *
 * @returns The block height if valid, or null.
 */
function parseBitmapContent(content: string): number | null {
  const trimmed = content.trim();
  if (!BITMAP_PATTERN.test(trimmed)) return null;
  const height = parseInt(trimmed.replace('.bitmap', ''), 10);
  return Number.isFinite(height) && height >= 0 ? height : null;
}

// ────────────────────────────────────────────
// Hiro API
// ────────────────────────────────────────────

interface HiroInscription {
  id: string;
  number: number;
  content_type: string;
  content_length: number;
  genesis_timestamp: number;
  address: string;
  // content is fetched separately
}

interface HiroInscriptionsResponse {
  results: HiroInscription[];
  total: number;
  limit: number;
  offset: number;
}

async function resolveFromHiro(address: string): Promise<Bitmap[]> {
  const bitmaps: Bitmap[] = [];
  let offset = 0;
  const limit = 60;

  // Paginate through all inscriptions for this address
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${HIRO_BASE}/inscriptions?address=${address}&limit=${limit}&offset=${offset}`;
    const data = await safeFetch<HiroInscriptionsResponse>(url);
    if (!data || !data.results?.length) break;

    for (const ins of data.results) {
      // Check content type — bitmaps are text/plain
      if (
        ins.content_type &&
        !ins.content_type.startsWith('text/plain') &&
        !ins.content_type.startsWith('text/html')
      ) {
        continue;
      }

      // Fetch inscription content
      const contentUrl = `${HIRO_BASE}/inscriptions/${ins.id}/content`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const contentRes = await fetch(contentUrl, { signal: controller.signal });
        clearTimeout(timer);

        if (!contentRes.ok) continue;
        const text = await contentRes.text();
        const blockHeight = parseBitmapContent(text);
        if (blockHeight === null) continue;

        bitmaps.push({
          inscriptionId: ins.id,
          number: ins.number,
          content: text.trim(),
          blockHeight,
          owner: address,
          contentType: ins.content_type,
          genesisTimestamp: ins.genesis_timestamp,
        });
      } catch {
        continue;
      }
    }

    offset += data.results.length;
    if (offset >= data.total) break;
  }

  return bitmaps;
}

// ────────────────────────────────────────────
// ord.io API (fallback)
// ────────────────────────────────────────────

interface OrdioInscription {
  inscription_id: string;
  inscription_number: number;
  content: string;
  content_type: string;
  address: string;
  timestamp: number;
}

interface OrdioResponse {
  inscriptions: OrdioInscription[];
}

async function resolveFromOrdio(address: string): Promise<Bitmap[]> {
  const bitmaps: Bitmap[] = [];
  const url = `${ORDIO_BASE}/address/${address}/inscriptions`;
  const data = await safeFetch<OrdioResponse>(url);

  if (!data?.inscriptions?.length) return bitmaps;

  for (const ins of data.inscriptions) {
    const blockHeight = parseBitmapContent(ins.content ?? '');
    if (blockHeight === null) continue;

    bitmaps.push({
      inscriptionId: ins.inscription_id,
      number: ins.inscription_number,
      content: ins.content.trim(),
      blockHeight,
      owner: address,
      contentType: ins.content_type,
      genesisTimestamp: ins.timestamp,
    });
  }

  return bitmaps;
}

// ────────────────────────────────────────────
// Core API
// ────────────────────────────────────────────

/**
 * Resolve all bitmap inscriptions owned by an address.
 *
 * Tries Hiro API first, falls back to ord.io on failure.
 *
 * @param address - A Bitcoin address (taproot / segwit / legacy).
 * @returns Resolved bitmaps with provenance source.
 *
 * @example
 * ```ts
 * const result = await resolveBitmap('bc1p…');
 * console.log(result.bitmaps.map(b => b.content));
 * // → ["840000.bitmap", "210000.bitmap"]
 * ```
 */
export async function resolveBitmap(address: string): Promise<BitmapResolutionResult> {
  // Try Hiro first
  const hiroBitmaps = await resolveFromHiro(address);
  if (hiroBitmaps.length > 0) {
    return {
      address,
      bitmaps: hiroBitmaps,
      source: 'hiro',
      resolvedAt: Date.now(),
    };
  }

  // Fallback to ord.io
  const ordioBitmaps = await resolveFromOrdio(address);
  return {
    address,
    bitmaps: ordioBitmaps,
    source: 'ordio',
    resolvedAt: Date.now(),
  };
}

/**
 * Verify that a specific inscription is currently owned by an address.
 *
 * @param inscriptionId - The inscription ID to check.
 * @param address       - The address to verify against.
 * @returns Ownership verification result.
 */
export async function verifyBitmapOwnership(
  inscriptionId: string,
  address: string,
): Promise<OwnershipVerification> {
  // Try Hiro
  const hiroUrl = `${HIRO_BASE}/inscriptions/${inscriptionId}`;
  const hiroData = await safeFetch<{ address: string }>(hiroUrl);

  if (hiroData?.address) {
    return {
      inscriptionId,
      address,
      isOwner: hiroData.address === address,
      checkedAt: Date.now(),
      source: 'hiro',
    };
  }

  // Fallback to ord.io
  const ordioUrl = `${ORDIO_BASE}/inscription/${inscriptionId}`;
  const ordioData = await safeFetch<{ address: string }>(ordioUrl);

  return {
    inscriptionId,
    address,
    isOwner: ordioData?.address === address,
    checkedAt: Date.now(),
    source: 'ordio',
  };
}

/** Exported for testing. */
export const _testHelpers = {
  parseBitmapContent,
  BITMAP_PATTERN,
};
