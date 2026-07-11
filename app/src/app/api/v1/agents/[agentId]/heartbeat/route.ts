import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { checkAgentToken, LEGACY_TOKEN_WARNING } from '@/lib/agent-tokens';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Cap the cadence so a leaked id can't be used to flood liveness pings /
    // heartbeat event rows (defense-in-depth alongside the token check below).
    if (!rateLimit(`hb:${agentId}`, 30, 60_000)) {
      return error('Too many heartbeats — slow down', 429);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);

    // AUTH: only the agent (holding its Bearer token) may assert its own
    // liveness. Legacy (pre-token) agents keep working via the grace path.
    const auth = checkAgentToken(agent, req.headers.get('authorization'));
    if (!auth.ok) return error(auth.reason || 'Unauthorized', auth.status);

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

    const res = success({ alive: true, lastHeartbeat: now.toISOString() });
    if (auth.legacy) res.headers.set('X-BG-Deprecation', LEGACY_TOKEN_WARNING);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
