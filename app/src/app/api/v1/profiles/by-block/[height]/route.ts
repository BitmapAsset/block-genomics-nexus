import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height } = await params;
    const blockHeight = parseInt(height, 10);
    if (isNaN(blockHeight)) return error('Invalid block height', 400);

    const profiles = await prisma.blockProfile.findMany({
      where: { blockHeight },
    });

    return success({ profiles });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
