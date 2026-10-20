import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { batchVerifyOwnership } from '@/lib/ownership-sync';
import { bearerFrom } from '@/lib/sandbox-tier';
import { secretMatches } from '@/lib/secret-match';

if (!process.env.CRON_SECRET && !process.env.OWNERSHIP_SYNC_SECRET) {
  console.warn('[ownership/cron] neither CRON_SECRET nor OWNERSHIP_SYNC_SECRET set — cron endpoint disabled');
}

/**
 * GET /api/v1/ownership/cron
 * Called by Vercel cron every 15 minutes
 * Checks up to 10 blocks per run
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

    // Find blocks to check — prioritize:
    // 1. Blocks with inscriptionId (can actually verify)
    // 2. Recently active / have guardians
    // 3. Least recently checked
    const blocks = await prisma.block.findMany({
      where: {
        ownerAddress: { not: null },
        inscriptionId: { not: null },
      },
      orderBy: { lastOwnerCheck: { sort: 'asc', nulls: 'first' } },
      take: 10,
      select: { height: true },
    });

    if (blocks.length === 0) {
      return success({ message: 'No blocks with inscriptionId to verify', checked: 0, transfers: 0 });
    }

    const heights = blocks.map(b => b.height);
    const results = await batchVerifyOwnership(heights);

    const transfers = results.filter(r => r.action === 'update');

    console.log(`[ownership-cron] Checked ${results.length} blocks, ${transfers.length} transfers detected`);

    return success({
      checked: results.length,
      transfers: transfers.length,
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
