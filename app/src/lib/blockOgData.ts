/**
 * Block summary used to build share cards — the OG image and the `<meta>` tags
 * on /block/[height]. Both need the same numbers, so the fetch lives here.
 *
 * Mined blocks are immutable, so responses are cached for a day and failures
 * degrade to `null` rather than throwing: a share card that renders without
 * stats is far better than a link that previews as nothing.
 */

import { generateGenome } from '@/lib/genome-utils';

const MEMPOOL_API = 'https://mempool.space/api';
const FETCH_TIMEOUT_MS = 6000;
const REVALIDATE_SECONDS = 86400;

export interface BlockOgSummary {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  /** 64-char hex genome derived deterministically from the block hash. */
  genome: string;
}

/**
 * Fetch the block header stats needed for a share card.
 *
 * Deliberately does not pull the transaction list the way `fetchRealBlock`
 * does — a card only needs the header, and OG rendering sits in the critical
 * path of a crawler request that will time out.
 */
export async function fetchBlockOgSummary(height: number): Promise<BlockOgSummary | null> {
  try {
    const hashRes = await fetch(`${MEMPOOL_API}/block-height/${height}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!hashRes.ok) return null;

    const hash = (await hashRes.text()).trim();
    if (!/^[0-9a-f]{64}$/i.test(hash)) return null;

    const blockRes = await fetch(`${MEMPOOL_API}/block/${hash}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!blockRes.ok) return null;

    const block = await blockRes.json();

    return {
      height,
      hash,
      timestamp: block.timestamp,
      txCount: block.tx_count,
      size: block.size,
      genome: generateGenome(hash).sequence,
    };
  } catch {
    return null;
  }
}
