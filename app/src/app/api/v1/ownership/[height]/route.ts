import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { verifyBlockOwnership } from '@/lib/ownership-sync';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

/**
 * GET /api/v1/ownership/[height]
 *
 * RESTful path-param alias for /api/v1/ownership/verify?blockHeight=<height>.
 * Numeric heights resolve here; the static sibling routes (verify, sync,
 * prep-transfer, cron) still take precedence for their exact paths. Always
 * returns JSON so callers never receive the Next.js 404 HTML shell.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-ownership-height' });
  if (rl.response) return rl.response;

  try {
    const { height } = await params;
    const blockHeight = parseBlockHeight(height);
    if (blockHeight === null) {
      return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);
    }

    // DISPLAY tier: public ownership read, gates no mutation.
    const check = await verifyBlockOwnership(blockHeight, 'display');

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
