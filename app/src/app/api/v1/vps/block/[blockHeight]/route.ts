import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-vps-block-blockHeight' });
  if (rl.response) return rl.response;

  try {
    const { blockHeight } = await params;
    const h = parseInt(blockHeight, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

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
