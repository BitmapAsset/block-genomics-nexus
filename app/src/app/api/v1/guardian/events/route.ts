import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { validateMonitorAuth } from '@/lib/monitor-tokens';

/**
 * A guardian's event log, for its owner: the rows include messages visitors
 * left for the owner. Read with that guardian's monitor token
 * (`Authorization: Bearer <token>`), as /api/v1/guardian/monitor/events is.
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-guardian-events' });
  if (rl.response) return rl.response;

  try {
    const { searchParams } = new URL(req.url);
    const guardianId = searchParams.get('guardianId');
    const eventType = searchParams.get('eventType');
    const handled = searchParams.get('handled');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!guardianId) {
      return NextResponse.json({ error: 'guardianId required' }, { status: 400 });
    }

    const guardian = await validateMonitorAuth(req.headers.get('authorization'), guardianId);
    if (!guardian) {
      return NextResponse.json({ error: 'Unauthorized: this guardian\'s monitor token is required' }, { status: 401 });
    }

    const where: Record<string, unknown> = { guardianId };
    if (eventType) where.eventType = eventType;
    if (handled !== null && handled !== undefined) where.handled = handled === 'true';

    const events = await prisma.guardianEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });

    return NextResponse.json({ events });
  } catch (err: unknown) {
    console.error('[Guardian Events]', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
