import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { guardianId, signature, challenge } = await req.json();

    if (!guardianId || !signature || !challenge) {
      return NextResponse.json({ error: 'guardianId, signature, and challenge required' }, { status: 400 });
    }

    const guardian = await prisma.guardianAgent.findUnique({ where: { id: guardianId } });
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    if (!guardian.selfHosted) return NextResponse.json({ error: 'Heartbeat only for self-hosted guardians' }, { status: 400 });

    // TODO: Verify signature against ownerAddress + challenge
    // For now, accept if guardian exists and is self-hosted

    await prisma.guardianAgent.update({
      where: { id: guardianId },
      data: { lastHeartbeat: new Date(), endpointVerified: true },
    });

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    console.error('[Guardian Heartbeat]', err);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
