import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { batchVerifyOwnership } from '@/lib/ownership-sync';

const OWNERSHIP_SYNC_SECRET = process.env.OWNERSHIP_SYNC_SECRET;
if (!OWNERSHIP_SYNC_SECRET) console.warn('[ownership/cron] OWNERSHIP_SYNC_SECRET not set — cron endpoint disabled');

/**
 * GET /api/v1/ownership/cron
 * Called by Vercel cron every 15 minutes
 * Checks up to 10 blocks per run
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = req.nextUrl.searchParams.get('secret');
    const providedSecret = authHeader?.replace('Bearer ', '') || cronSecret;

    if (providedSecret !== OWNERSHIP_SYNC_SECRET) {
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
      } as any,
      orderBy: { lastOwnerCheck: { sort: 'asc', nulls: 'first' } } as any,
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
  } catch (e: any) {
    console.error('[ownership-cron] Error:', e);
    return error(e.message, 500);
  }
}
