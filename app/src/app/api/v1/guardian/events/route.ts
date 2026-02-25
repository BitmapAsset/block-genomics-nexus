import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const guardianId = searchParams.get('guardianId');
    const eventType = searchParams.get('eventType');
    const handled = searchParams.get('handled');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!guardianId) {
      return NextResponse.json({ error: 'guardianId required' }, { status: 400 });
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
