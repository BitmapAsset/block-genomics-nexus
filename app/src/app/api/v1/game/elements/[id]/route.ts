import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { ownerAddress, ...updates } = body;

    const element = await prisma.gameElement.findUnique({ where: { id } });
    if (!element) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (element.ownerAddress !== ownerAddress) return NextResponse.json({ error: 'Not the owner' }, { status: 403 });

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
    const { ownerAddress } = body;

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
