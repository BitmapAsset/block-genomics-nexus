import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

// Legacy route — redirects to new schema. Use /api/v1/blocks/[height] for new API.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(request, { bucket: 'v1-block-height' });
  if (rl.response) return rl.response;

  try {
    const { height } = await params;
    const blockHeight = Number.parseInt(height, 10);

    if (!Number.isInteger(blockHeight) || blockHeight < 0) {
      return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });
    }

    const block = await prisma.block.findUnique({
      where: { height: blockHeight },
      include: { owner: { select: { walletAddress: true, handle: true, tier: true } } },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: block });
  } catch (error) {
    console.error('Block fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
