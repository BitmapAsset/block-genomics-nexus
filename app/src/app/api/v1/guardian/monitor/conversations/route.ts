import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validateMonitorAuth } from '@/lib/monitor-tokens';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const guardianId = url.searchParams.get('guardianId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const after = url.searchParams.get('after');

    if (!guardianId) return error('guardianId is required');

    const guardian = await validateMonitorAuth(
      req.headers.get('authorization'),
      guardianId
    );
    if (!guardian) return error('Unauthorized', 401);

    const where: Record<string, unknown> = { guardianId };
    if (after) {
      where.createdAt = { gte: new Date(after) };
    }

    const conversations = await prisma.guardianConversation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return success(
      conversations.map((c) => ({
        ...c,
        messages: JSON.parse(c.messages),
      }))
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
