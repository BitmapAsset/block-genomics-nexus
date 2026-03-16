import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';

// H-03: Allowlist of fields that can be updated on block objects
const ALLOWED_UPDATE_FIELDS = ['objectType', 'geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible', 'locked'];

function pickAllowed(body: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) safe[field] = body[field];
  }
  return safe;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, signature, message } = body;

    if (!ownerAddress) return NextResponse.json({ error: 'ownerAddress required' }, { status: 400 });

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const existing = await prisma.blockObject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    if (existing.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not owner' }, { status: 403 });
    if (existing.locked) return NextResponse.json({ error: 'Object is locked' }, { status: 403 });

    const updates = pickAllowed(body);
    const updated = await prisma.blockObject.update({ where: { id }, data: updates });
    return NextResponse.json({ object: updated });
  } catch (err) {
    console.error('[World PATCH]', err);
    return NextResponse.json({ error: 'Failed to update object' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerAddress, signature, message } = await req.json();

    if (!ownerAddress) return NextResponse.json({ error: 'ownerAddress required' }, { status: 400 });

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const existing = await prisma.blockObject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    if (existing.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not owner' }, { status: 403 });
    if (existing.locked) return NextResponse.json({ error: 'Object is locked' }, { status: 403 });

    await prisma.blockObject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[World DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete object' }, { status: 500 });
  }
}
