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

    const links = await prisma.vPSLink.findMany({
      where: { blockHeight: h, status: 'linked' },
      orderBy: { createdAt: 'desc' },
    });

    return success(links);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
