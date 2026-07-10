import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Heartbeat is keyed only by the (non-public) agent id; cap the cadence so a
    // leaked id can't be used to flood liveness pings / heartbeat event rows.
    if (!rateLimit(`hb:${agentId}`, 30, 60_000)) {
      return error('Too many heartbeats — slow down', 429);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);
    if (agent.status !== 'active') return error('Agent is not active', 403);

    const now = new Date();

    await prisma.$transaction([
      prisma.bitmapAgent.update({
        where: { id: agentId },
        data: { lastHeartbeat: now },
      }),
      prisma.agentEvent.create({
        data: {
          agentId,
          type: 'heartbeat',
          payload: JSON.stringify({ timestamp: now.toISOString() }),
        },
      }),
    ]);

    return success({ alive: true, lastHeartbeat: now.toISOString() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
