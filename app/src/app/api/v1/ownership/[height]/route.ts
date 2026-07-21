import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { verifyBlockOwnership } from '@/lib/ownership-sync';

/**
 * GET /api/v1/ownership/[height]
 *
 * RESTful path-param alias for /api/v1/ownership/verify?blockHeight=<height>.
 * Numeric heights resolve here; the static sibling routes (verify, sync,
 * prep-transfer, cron) still take precedence for their exact paths. Always
 * returns JSON so callers never receive the Next.js 404 HTML shell.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height } = await params;
    if (!/^\d+$/.test(height)) {
      return error('Invalid block height (positive integer required)', 400);
    }
    const blockHeight = parseInt(height, 10);
    if (!Number.isSafeInteger(blockHeight) || blockHeight <= 0) {
      return error('Invalid block height (positive integer required)', 400);
    }

    const check = await verifyBlockOwnership(blockHeight);

    return success({
      blockHeight: check.blockHeight,
      dbOwner: check.dbOwnerAddress,
      onChainOwner: check.onChainOwnerAddress,
      match: check.match,
      inscriptionId: check.inscriptionId,
      action: check.action,
      lastChecked: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
