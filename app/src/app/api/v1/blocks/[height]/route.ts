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

    const block = await prisma.block.findUnique({
      where: { height: h },
      include: {
        owner: { select: { walletAddress: true, handle: true, avatar: true, tier: true } },
        _count: { select: { parcels: true } },
      },
    });

    if (!block) return error('Block not found', 404);

    return success({
      ...block,
      parcelCount: block._count.parcels,
      _count: undefined,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
