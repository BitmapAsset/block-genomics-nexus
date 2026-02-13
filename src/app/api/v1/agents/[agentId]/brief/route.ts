import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await req.json();
    const { period, summary, stats, pendingPermissions } = body;

    if (!period || !summary || !stats) {
      return error('Missing required fields: period, summary, stats', 400);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);
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

    return success({
      ...brief,
      stats: JSON.parse(brief.stats),
      pendingPermissions: JSON.parse(brief.pendingPermissions),
    }, 201);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
