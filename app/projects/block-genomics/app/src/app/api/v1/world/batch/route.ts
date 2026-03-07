import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface BatchOp {
  action: 'create' | 'update' | 'delete';
  id?: string;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const { blockHeight, ownerAddress, operations } = await req.json() as {
      blockHeight: number; ownerAddress: string; operations: BatchOp[];
    };

    if (!blockHeight || !ownerAddress || !operations?.length) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, operations required' }, { status: 400 });
    }

    if (operations.length > 100) {
      return NextResponse.json({ error: 'Max 100 operations per batch' }, { status: 400 });
    }

    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    const results: { action: string; id?: string; success: boolean; error?: string }[] = [];

    for (const op of operations) {
      try {
        if (op.action === 'create' && op.data) {
          const obj = await prisma.blockObject.create({
            data: { blockHeight, ownerAddress, ...op.data } as any,
          });
          results.push({ action: 'create', id: obj.id, success: true });
        } else if (op.action === 'update' && op.id && op.data) {
          const existing = await prisma.blockObject.findUnique({ where: { id: op.id } });
          if (!existing || existing.ownerAddress !== ownerAddress || existing.locked) {
            results.push({ action: 'update', id: op.id, success: false, error: 'Not found/owned/locked' });
            continue;
          }
          await prisma.blockObject.update({ where: { id: op.id }, data: op.data as any });
          results.push({ action: 'update', id: op.id, success: true });
        } else if (op.action === 'delete' && op.id) {
          const existing = await prisma.blockObject.findUnique({ where: { id: op.id } });
          if (!existing || existing.ownerAddress !== ownerAddress || existing.locked) {
            results.push({ action: 'delete', id: op.id, success: false, error: 'Not found/owned/locked' });
            continue;
          }
          await prisma.blockObject.delete({ where: { id: op.id } });
          results.push({ action: 'delete', id: op.id, success: true });
        }
      } catch (e) {
        results.push({ action: op.action, id: op.id, success: false, error: String(e) });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[World Batch]', err);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
