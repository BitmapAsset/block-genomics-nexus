import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-height' });
  if (rl.response) return rl.response;

  try {
    const gate = await sandboxGate(req);
    if (gate.response) return gate.response;

    const { height } = await params;
    const h = parseInt(height, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const block = await prisma.block.findUnique({
      where: { height: h },
      include: {
        owner: { select: { walletAddress: true, handle: true, avatar: true, tier: true, resolvedTier: true } },
        _count: { select: { parcels: true } },
      },
    });

    if (!block) return error('Block not found', 404);

    return success(
      {
        ...block,
        parcelCount: block._count.parcels,
        _count: undefined,
      },
      200,
      gate.headers
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
