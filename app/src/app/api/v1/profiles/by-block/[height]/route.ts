import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { emitAgentEvent } from '@/lib/agent-events';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height } = await params;
    const blockHeight = parseInt(height, 10);
    if (isNaN(blockHeight)) return error('Invalid block height', 400);

    // Deterministic ordering so consumers that take profiles[0] always get the
    // same, meaningful profile (the block's primary first, then oldest). Without
    // this the DB may return rows in arbitrary order and a different block's
    // owner could surface on this block.
    const profiles = await prisma.blockProfile.findMany({
      where: { blockHeight },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      include: { owner: { select: { resolvedTier: true } } },
    });

    // Attach live resolvedTier (SSOT) from the owning User; strip the joined relation.
    const withResolved = profiles.map(({ owner, ...p }) => ({
      ...p,
      resolvedTier: owner?.resolvedTier ?? 0,
    }));

    // Fire-and-forget: notify any registered agents that a visitor viewed this
    // block's profile. Dedupe-throttled per-visitor inside emitAgentEvent.
    const actor =
      req?.headers?.get?.('x-visitor-wallet') ||
      req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
      'anonymous';
    void emitAgentEvent(blockHeight, 'visitor_arrived', {
      actor,
      summary: `Visitor viewed block #${blockHeight} profile`,
      blockHeight,
      profileCount: profiles.length,
    });

    return success({ profiles: withResolved });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
