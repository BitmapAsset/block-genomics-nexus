import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-agents-agentId-briefs' });
  if (rl.response) return rl.response;

  try {
    const { agentId } = await params;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);

    const briefs = await prisma.agentBrief.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return success(
      briefs.map((b) => ({
        ...b,
        stats: JSON.parse(b.stats),
        pendingPermissions: JSON.parse(b.pendingPermissions),
      }))
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
