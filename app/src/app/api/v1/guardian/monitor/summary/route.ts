import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validateMonitorAuth } from '@/lib/monitor-tokens';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const guardianId = url.searchParams.get('guardianId');
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);

    if (!guardianId) return error('guardianId is required');

    const guardian = await validateMonitorAuth(
      req.headers.get('authorization'),
      guardianId
    );
    if (!guardian) return error('Unauthorized', 401);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [conversations, events, escalations] = await Promise.all([
      prisma.guardianConversation.findMany({
        where: { guardianId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.guardianEvent.findMany({
        where: { guardianId, createdAt: { gte: since } },
      }),
      prisma.guardianEvent.count({
        where: { guardianId, eventType: 'escalation', createdAt: { gte: since } },
      }),
    ]);

    // Count total messages across conversations
    let totalMessages = 0;
    const visitorSet = new Set<string>();
    const recentMessages: string[] = [];

    for (const conv of conversations) {
      try {
        const msgs = JSON.parse(conv.messages);
        totalMessages += Array.isArray(msgs) ? msgs.length : 0;
        if (Array.isArray(msgs)) {
          for (const m of msgs.slice(-3)) {
            if (m.content) recentMessages.push(m.content);
          }
        }
      } catch {
        // skip malformed
      }
      if (conv.visitorAddress) visitorSet.add(conv.visitorAddress);
    }

    return success({
      guardianId,
      periodHours: hours,
      totalConversations: conversations.length,
      totalMessages,
      uniqueVisitors: visitorSet.size,
      escalations,
      totalEvents: events.length,
      eventsByType: events.reduce(
        (acc, e) => {
          acc[e.eventType] = (acc[e.eventType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      recentMessages: recentMessages.slice(-10),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
