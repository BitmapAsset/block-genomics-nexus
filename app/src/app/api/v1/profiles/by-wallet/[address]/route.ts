import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-profiles-by-wallet-address' });
  if (rl.response) return rl.response;

  try {
    const { address } = await params;

    const profiles = await prisma.blockProfile.findMany({
      where: {
        walletAddress: {
          equals: address,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { resolvedTier: true } } },
    });

    // Attach live resolvedTier (SSOT) from the owning User; strip the joined relation.
    const withResolved = profiles.map(({ owner, ...p }) => ({
      ...p,
      resolvedTier: owner?.resolvedTier ?? 0,
    }));

    return success({ profiles: withResolved });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
