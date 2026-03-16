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

    const agents = await prisma.bitmapAgent.findMany({
      where: { blockHeight: h, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    return success(
      agents.map((a) => ({ ...a, permissions: JSON.parse(a.permissions) }))
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
