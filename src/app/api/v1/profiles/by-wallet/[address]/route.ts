import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    const profiles = await prisma.blockProfile.findMany({
      where: { walletAddress: address },
      orderBy: { createdAt: 'desc' },
    });

    return success({ profiles });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
