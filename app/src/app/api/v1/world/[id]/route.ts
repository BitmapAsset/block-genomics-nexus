import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, ...updates } = body;

    if (!ownerAddress) return NextResponse.json({ error: 'ownerAddress required' }, { status: 400 });

    const existing = await prisma.blockObject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    if (existing.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not owner' }, { status: 403 });
    if (existing.locked) return NextResponse.json({ error: 'Object is locked' }, { status: 403 });

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.blockHeight;
    delete updates.createdAt;

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
    const { ownerAddress } = await req.json();

    if (!ownerAddress) return NextResponse.json({ error: 'ownerAddress required' }, { status: 400 });

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
