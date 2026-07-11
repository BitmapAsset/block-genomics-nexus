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

    // Briefs are ~daily; cap hard as defense-in-depth alongside the token check.
    if (!rateLimit(`brief:${agentId}`, 5, 60_000)) {
      return error('Too many briefs — slow down', 429);
    }

    const body = await req.json();
    const { period, summary, stats, pendingPermissions } = body;

    if (!period || !summary || !stats) {
      return error('Missing required fields: period, summary, stats', 400);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);

    // AUTH: only the agent (holding its Bearer token) may file its own brief —
    // this closes fabricated-brief injection. Legacy agents use the grace path.
    const auth = checkAgentToken(agent, req.headers.get('authorization'));
    if (!auth.ok) return error(auth.reason || 'Unauthorized', auth.status);

    if (agent.status !== 'active') return error('Agent is not active', 403);

    const brief = await prisma.agentBrief.create({
      data: {
        agentId,
        period,
        summary,
        stats: JSON.stringify(stats),
        pendingPermissions: JSON.stringify(pendingPermissions || []),
      },
    });

    const res = success({
      ...brief,
      stats: JSON.parse(brief.stats),
      pendingPermissions: JSON.parse(brief.pendingPermissions),
    }, 201);
    if (auth.legacy) res.headers.set('X-BG-Deprecation', LEGACY_TOKEN_WARNING);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
