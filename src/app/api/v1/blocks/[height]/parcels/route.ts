import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
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
  } catch (e: any) {
    return error(e.message, 500);
  }
}
