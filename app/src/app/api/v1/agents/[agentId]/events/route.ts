import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { checkAgentToken, LEGACY_TOKEN_WARNING } from '@/lib/agent-tokens';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Bound polling even for a valid token holder.
    if (!rateLimit(`ev:${agentId}`, 120, 60_000)) {
      return error('Too many event polls — slow down', 429);
    }

    const url = new URL(req.url);
    const since = url.searchParams.get('since');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);

    // AUTH: the event stream is PRIVATE. Require the agent's Bearer token.
    // Legacy (pre-token) agents keep working via the grace path with a warning.
    const auth = checkAgentToken(agent, req.headers.get('authorization'));
    if (!auth.ok) return error(auth.reason || 'Unauthorized', auth.status);

    const where: Record<string, unknown> = { agentId };
    if (since) {
      where.timestamp = { gte: new Date(since) };
    }

    const events = await prisma.agentEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    const data = events.map((e) => ({ ...e, payload: JSON.parse(e.payload) }));
    const res = success(data);
    // Deprecation delivered as a header so the JSON contract (a bare array) is unchanged.
    if (auth.legacy) res.headers.set('X-BG-Deprecation', LEGACY_TOKEN_WARNING);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
