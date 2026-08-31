import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-agents-block-blockHeight' });
  if (rl.response) return rl.response;

  try {
    const { blockHeight } = await params;
    const h = parseBlockHeight(blockHeight);
    if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    const agents = await prisma.bitmapAgent.findMany({
      where: { blockHeight: h, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: {
        walletAddress: true,
        endpointUrl: true,
        blockHeight: true,
        parcelIndex: true,
        tier: true,
        permissions: true,
        status: true,
        createdAt: true,
        lastHeartbeat: true,
      },
    });

    // PUBLIC directory projection. The internal agent `id` is a MANAGEMENT
    // capability — events poll, heartbeat, and brief are all keyed by it — so it
    // is never exposed here. Publishing it would let anyone read another owner's
    // private event stream or spoof their agent's liveness. The full owner wallet
    // is reduced to a display-truncated form.
    return success(
      agents.map((a) => ({
        blockHeight: a.blockHeight,
        parcelIndex: a.parcelIndex,
        tier: a.tier,
        permissions: JSON.parse(a.permissions),
        status: a.status,
        endpointUrl: a.endpointUrl,
        owner: truncateAddress(a.walletAddress),
        createdAt: a.createdAt,
        lastHeartbeat: a.lastHeartbeat,
      }))
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/** Display-truncate a wallet address (keep it recognizable without publishing it in full). */
function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
