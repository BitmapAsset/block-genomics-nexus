import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-vps-block-blockHeight' });
  if (rl.response) return rl.response;

  try {
    const { blockHeight } = await params;
    const h = parseBlockHeight(blockHeight);
    if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    const links = await prisma.vPSLink.findMany({
      where: { blockHeight: h, status: 'linked' },
      orderBy: { createdAt: 'desc' },
    });

    return success(links);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
