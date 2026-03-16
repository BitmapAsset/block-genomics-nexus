import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const url = new URL(req.url);
    const since = url.searchParams.get('since');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);

    const where: Record<string, unknown> = { agentId };
    if (since) {
      where.timestamp = { gte: new Date(since) };
    }

    const events = await prisma.agentEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return success(
      events.map((e) => ({ ...e, payload: JSON.parse(e.payload) }))
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
