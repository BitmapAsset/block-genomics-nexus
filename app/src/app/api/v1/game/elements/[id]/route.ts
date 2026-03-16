import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, signature, message } = body;

    // SECURITY: Require wallet signature verification
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'ownerAddress, signature, and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const element = await prisma.gameElement.findUnique({ where: { id } });
    if (!element) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (element.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not the owner' }, { status: 403 });

    // H-03: Allowlist fields to prevent mass assignment
    const allowedFields = ['name', 'description', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'color', 'geometry', 'material', 'config', 'enabled'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const updated = await prisma.gameElement.update({ where: { id }, data: updates });
    return NextResponse.json({ element: updated });
  } catch (err) {
    console.error('[GameElement PATCH]', err);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, signature, message } = body;

    // SECURITY: Require wallet signature verification
    if (!ownerAddress || !signature || !message) {
      return NextResponse.json({ error: 'ownerAddress, signature, and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const element = await prisma.gameElement.findUnique({ where: { id } });
    if (!element) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (element.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not the owner' }, { status: 403 });

    await prisma.gameElement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[GameElement DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
