/**
 * Block summary used to build share cards — the OG image and the `<meta>` tags
 * on /block/[height]. Both need the same numbers, so the fetch lives here.
 *
 * Mined blocks are immutable, so responses are cached for a day and failures
 * degrade to `null` rather than throwing: a share card that renders without
 * stats is far better than a link that previews as nothing.
 *
 * The two mempool calls of a height this server has not read yet are charged
 * to one budget every instance shares (OG_SUMMARY_CALLS_PER_MIN, about 60 cold
 * heights a minute); past it the answer is `null`. A height read once is kept
 * in memory, so a page view of a block this server already knows charges
 * nothing. When the limiter cannot count, the read goes ahead. Both calls
 * refuse redirects and read their body under a byte cap; either is `null`.
 */

import { generateGenome } from '@/lib/genome-utils';
import { readCappedJson, readCappedText } from '@/lib/capped-read';
import { rateLimitDurable } from '@/lib/rate-limit-db';

const MEMPOOL_API = 'https://mempool.space/api';
const FETCH_TIMEOUT_MS = 6000;
const REVALIDATE_SECONDS = 86400;

/** mempool calls per minute for share-card stats, across every instance (two per height). */
export const OG_SUMMARY_CALLS_PER_MIN = 120;

// Heights this server has read, kept as long as the fetch cache keeps them.
const MAX_REMEMBERED = 512;
const remembered = new Map<number, { summary: BlockOgSummary; expiresAt: number }>();

/** Test seam: forget every height this server has read. */
export function __resetBlockOgCacheForTest(): void {
  remembered.clear();
}

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
  const known = remembered.get(height);
  if (known && known.expiresAt > Date.now()) return known.summary;
  try {
    const budget = await rateLimitDurable('upstream:mempool-og:global', OG_SUMMARY_CALLS_PER_MIN, 60_000);
    if (!budget.allowed) return null;

    const hashRes = await fetch(`${MEMPOOL_API}/block-height/${height}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!hashRes.ok) return null;

    const hash = ((await readCappedText(hashRes, 128)) ?? '').trim();
    if (!/^[0-9a-f]{64}$/i.test(hash)) return null;

    const blockRes = await fetch(`${MEMPOOL_API}/block/${hash}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!blockRes.ok) return null;

    const block = (await readCappedJson(blockRes, 64 * 1024, 'Block info')) as {
      timestamp: number;
      tx_count: number;
      size: number;
    } | null;
    if (!block) return null;

    const summary: BlockOgSummary = {
      height,
      hash,
      timestamp: block.timestamp,
      txCount: block.tx_count,
      size: block.size,
      genome: generateGenome(hash).sequence,
    };
    remembered.delete(height);
    remembered.set(height, { summary, expiresAt: Date.now() + REVALIDATE_SECONDS * 1000 });
    if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value as number);
    return summary;
  } catch {
    return null;
  }
}
