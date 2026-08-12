import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-height-parcels' });
  if (rl.response) return rl.response;

  try {
    const { height } = await params;
    const h = parseInt(height, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const parcels = await prisma.parcel.findMany({
      where: { blockHeight: h },
      include: {
        owner: { select: { walletAddress: true, handle: true, tier: true } },
      },
      orderBy: { txIndex: 'asc' },
    });

    return success(parcels);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
