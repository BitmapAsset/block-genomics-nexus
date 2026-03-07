import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  try {
    const { blockHeight } = await params;
    const h = parseInt(blockHeight, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const estates = await prisma.estate.findMany({
      where: { blockHeight: h },
      include: {
        owner: { select: { walletAddress: true, handle: true, tier: true } },
      },
    });

    // Parse parcelIndices from JSON string
    const parsed = estates.map(e => ({
      ...e,
      parcelIndices: JSON.parse(e.parcelIndices),
    }));

    return success(parsed);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
