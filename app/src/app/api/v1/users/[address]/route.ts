import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-users-address' });
  if (rl.response) return rl.response;

  try {
    const { address } = await params;

    const user = await prisma.user.findUnique({
      where: { walletAddress: address },
      include: {
        _count: { select: { blocks: true, parcels: true, estates: true } },
      },
    });

    if (!user) return error('User not found', 404);

    // Get active delegations received
    const activeDelegations = await prisma.delegation.count({
      where: { delegateeAddress: address, active: true, endDate: { gte: new Date() } },
    });

    return success({
      ...user,
      blockCount: user._count.blocks,
      parcelCount: user._count.parcels,
      estateCount: user._count.estates,
      activeDelegations,
      _count: undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
