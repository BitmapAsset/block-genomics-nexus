import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-estates-blockHeight' });
  if (rl.response) return rl.response;

  try {
    const { blockHeight } = await params;
    const h = parseBlockHeight(blockHeight);
    if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    const estates = await prisma.estate.findMany({
      where: { blockHeight: h },
      include: {
        // `resolvedTier`, not `tier`: the first is resolved from the chain,
        // the second defaults to 3 for every row that exists, and the UI draws
        // a crown from whichever it is handed.
        owner: { select: { walletAddress: true, handle: true, resolvedTier: true } },
      },
    });

    // Parse parcelIndices from JSON string
    const parsed = estates.map(e => ({
      ...e,
      parcelIndices: JSON.parse(e.parcelIndices),
    }));

    return success(parsed);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
