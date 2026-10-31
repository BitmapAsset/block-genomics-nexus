import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { batchVerifyOwnership } from '@/lib/ownership-sync';
import { prewarmDeeds } from '@/lib/onchain/deed';
import { bearerFrom } from '@/lib/sandbox-tier';
import { secretMatches } from '@/lib/secret-match';
import { emitDeedMoved } from '@/lib/block-event-emitters';
import { eventsEnabled } from '@/lib/block-events';

export const maxDuration = 60;

/** Per-block and total wait for deed pre-resolution, inside maxDuration. */
const PREWARM_PER_BLOCK_MS = 20_000;
const PREWARM_TOTAL_MS = 35_000;

if (!process.env.CRON_SECRET && !process.env.OWNERSHIP_SYNC_SECRET) {
  console.warn('[ownership/cron] neither CRON_SECRET nor OWNERSHIP_SYNC_SECRET set — cron endpoint disabled');
}

/**
 * GET /api/v1/ownership/cron
 * Called by Vercel cron every 15 minutes
 * Checks up to 10 blocks per run
 *
 * Each run first resolves the deed of the blocks it is about to check
 * (lib/onchain/deed.ts, cached in the DeedVerdict table), with a longer wait
 * than a request gets. Blocks from 942,000 are resolved by walking raw blocks,
 * which can outlast a request's budget; pre-resolving them here is what keeps
 * their owners' first write from answering 503.
 *
 * Accepted credentials, read from the environment on every request (an empty
 * value counts as unset):
 *   - `Authorization: Bearer <CRON_SECRET>` — what Vercel cron sends. Header
 *     only; Vercel never puts it in the URL.
 *   - `Authorization: Bearer <OWNERSHIP_SYNC_SECRET>`, or the legacy
 *     `?secret=<OWNERSHIP_SYNC_SECRET>` — the original manual trigger, kept as
 *     an alias so existing callers keep working.
 */
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || undefined;
    const syncSecret = process.env.OWNERSHIP_SYNC_SECRET || undefined;

    // FAIL CLOSED: with no secret configured there is nothing to authenticate
    // against, so refuse before any database work rather than run unguarded.
    if (!cronSecret && !syncSecret) {
      console.error('[ownership-cron] neither CRON_SECRET nor OWNERSHIP_SYNC_SECRET set — refusing request');
      return error('Cron endpoint disabled: secret not configured', 503);
    }

    const bearer = bearerFrom(req.headers.get('authorization'));
    const querySecret = req.nextUrl.searchParams.get('secret');
    const authorized =
      secretMatches(bearer, cronSecret) ||
      secretMatches(bearer, syncSecret) ||
      secretMatches(querySecret, syncSecret);

    if (!authorized) {
      return error('Unauthorized', 401);
    }

    // Find blocks to check: every block with a recorded owner, least recently
    // checked first. The deed comes from the resolver, so a block with no
    // stored inscriptionId is checkable too.
    const blocks = await prisma.block.findMany({
      where: {
        ownerAddress: { not: null },
      },
      orderBy: { lastOwnerCheck: { sort: 'asc', nulls: 'first' } },
      take: 10,
      select: { height: true },
    });

    if (blocks.length === 0) {
      return success({ message: 'No owned blocks to verify', checked: 0, transfers: 0 });
    }

    const heights = blocks.map(b => b.height);
    const deeds = await prewarmDeeds(heights, { budgetMs: PREWARM_PER_BLOCK_MS, deadline: Date.now() + PREWARM_TOTAL_MS });
    const results = await batchVerifyOwnership(heights);

    const transfers = results.filter(r => r.action === 'update');

    // Living Block: `deed.moved` only for a transfer that actually landed. A
    // mismatch can be deferred (derived holder, insane indexer tip), so re-read
    // the rows rather than trusting `action`: moved = the stored owner is now the
    // on-chain holder and was someone else before this run. Only with events
    // on: with the flag off this read has no use, and a failure in it would
    // turn the committed sync above into an error response.
    if (transfers.length > 0 && eventsEnabled()) {
      const after = await prisma.block.findMany({
        where: { height: { in: transfers.map(t => t.blockHeight) } },
        select: { height: true, ownerAddress: true, inscriptionId: true },
      });
      for (const t of transfers) {
        const row = after.find(b => b.height === t.blockHeight);
        if (row?.ownerAddress && row.ownerAddress === t.onChainOwnerAddress && row.ownerAddress !== t.dbOwnerAddress) {
          await emitDeedMoved({ block: t.blockHeight, holder: row.ownerAddress, inscriptionId: row.inscriptionId ?? t.inscriptionId });
        }
      }
    }

    console.log(`[ownership-cron] Checked ${results.length} blocks, ${transfers.length} transfers detected`);

    return success({
      checked: results.length,
      transfers: transfers.length,
      deeds: deeds.map(d => ({ blockHeight: d.height, verdict: d.verdict })),
      results: results.map(r => ({
        blockHeight: r.blockHeight,
        match: r.match,
        action: r.action,
      })),
    });
  } catch (e: unknown) {
    console.error('[ownership-cron] Error:', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
