import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const { guardianId, ownerAddress, signature, message } = await req.json();

    if (!guardianId || !ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'guardianId, ownerAddress, signature, and message required' }, { status: 400 });
    }

    const guardian = await prisma.guardianAgent.findUnique({ where: { id: guardianId } });
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    if (!guardian.selfHosted) return NextResponse.json({ error: 'Heartbeat only for self-hosted guardians' }, { status: 400 });

    // Verify guardian belongs to this owner
    if (guardian.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Guardian does not belong to this owner' }, { status: 403 });
    }

    // Verify wallet signature
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

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
