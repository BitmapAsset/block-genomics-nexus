// ============================================================================
// Bitmap Ownership Verification via Hiro Ordinals API
// ============================================================================

import type { BitmapCheckResult, OrdinalInscription } from '../types.js';

const HIRO_BASE = 'https://api.hiro.so/ordinals/v1';
const PAGE_LIMIT = 60; // max per Hiro page
const MAX_PAGES = 10;  // safety cap — don't crawl forever

/**
 * Check whether `address` holds a Bitmap inscription for `blockHeight`.
 *
 * Strategy:
 *   1. Fetch text/plain inscriptions owned by the address (paginated).
 *   2. For each, fetch its content and look for `{blockHeight}.bitmap`.
 *   3. Return on first match.
 */
export async function checkBitmapOwnership(
  address: string,
  blockHeight: number,
): Promise<BitmapCheckResult> {
  const target = `${blockHeight}.bitmap`;

  try {
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${HIRO_BASE}/inscriptions`);
      url.searchParams.set('address', address);
      url.searchParams.set('mime_type', 'text/plain');
      url.searchParams.set('limit', String(PAGE_LIMIT));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        console.error(`[bitmap] Hiro API returned ${res.status} for address ${address}`);
        break;
      }

      const data = (await res.json()) as {
        results: OrdinalInscription[];
        total: number;
      };

      if (!data.results?.length) break;

      // Check each inscription's content
      for (const insc of data.results) {
        const match = await checkInscriptionContent(insc.id, target);
        if (match) {
          const ageDays = inscriptionAgeDays(insc.genesis_timestamp);
          return {
            owns: true,
            inscriptionId: insc.id,
            inscriptionAge: ageDays,
          };
        }
      }

      offset += data.results.length;
      if (offset >= data.total) break;
    }
  } catch (err) {
    console.error(`[bitmap] Error checking ownership for ${address}:`, err);
  }

  return { owns: false, inscriptionId: null, inscriptionAge: null };
}

/**
 * Fetch an inscription's content and check for an exact bitmap match.
 */
async function checkInscriptionContent(
  inscriptionId: string,
  target: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${HIRO_BASE}/inscriptions/${inscriptionId}/content`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;

    const text = (await res.text()).trim();
    return text === target;
  } catch {
    return false;
  }
}

/**
 * Calculate inscription age in days from a unix-ms timestamp.
 */
function inscriptionAgeDays(genesisTimestamp: number): number {
  const ms = Date.now() - genesisTimestamp;
  return Math.max(0, Math.floor(ms / 86_400_000));
}
