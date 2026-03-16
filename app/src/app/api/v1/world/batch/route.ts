import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';

// H-03: Allowlist of fields for block objects
const ALLOWED_OBJECT_FIELDS = ['objectType', 'geometry', 'color', 'material', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ', 'name', 'visible'];

function pickAllowed(data: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of ALLOWED_OBJECT_FIELDS) {
    if (data[field] !== undefined) safe[field] = data[field];
  }
  return safe;
}

interface BatchOp {
  action: 'create' | 'update' | 'delete';
  id?: string;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, ownerAddress, operations, signature, message } = body as {
      blockHeight: number; ownerAddress: string; operations: BatchOp[];
      signature?: string; message?: string;
    };

    if (!blockHeight || !ownerAddress || !operations?.length) {
      return NextResponse.json({ error: 'blockHeight, ownerAddress, operations required' }, { status: 400 });
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return NextResponse.json({ error: 'signature and message required' }, { status: 401 });
    }
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (operations.length > 100) {
      return NextResponse.json({ error: 'Max 100 operations per batch' }, { status: 400 });
    }

    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Not the block owner' }, { status: 403 });
    }

    // Batch-fetch all existing objects that will be updated/deleted (eliminates N+1)
    const idsToCheck = operations
      .filter(op => (op.action === 'update' || op.action === 'delete') && op.id)
      .map(op => op.id!);

    const existingMap = new Map<string, { id: string; ownerAddress: string; locked: boolean }>();
    if (idsToCheck.length > 0) {
      const existing = await prisma.blockObject.findMany({
        where: { id: { in: idsToCheck } },
        select: { id: true, ownerAddress: true, locked: true },
      });
      for (const obj of existing) {
        existingMap.set(obj.id, obj);
      }
    }

    const results: { action: string; id?: string; success: boolean; error?: string }[] = [];

    for (const op of operations) {
      try {
        if (op.action === 'create' && op.data) {
          const safeData = pickAllowed(op.data);
          if (!safeData.objectType || typeof safeData.objectType !== 'string') {
            results.push({ action: 'create', success: false, error: 'objectType is required' });
            continue;
          }
          const obj = await prisma.blockObject.create({
            data: { blockHeight, ownerAddress, objectType: safeData.objectType, ...safeData },
          });
          results.push({ action: 'create', id: obj.id, success: true });
        } else if (op.action === 'update' && op.id && op.data) {
          const existing = existingMap.get(op.id);
          if (!existing || existing.ownerAddress !== ownerAddress || existing.locked) {
            results.push({ action: 'update', id: op.id, success: false, error: 'Not found/owned/locked' });
            continue;
          }
          const safeData = pickAllowed(op.data);
          await prisma.blockObject.update({ where: { id: op.id }, data: safeData });
          results.push({ action: 'update', id: op.id, success: true });
        } else if (op.action === 'delete' && op.id) {
          const existing = existingMap.get(op.id);
          if (!existing || existing.ownerAddress !== ownerAddress || existing.locked) {
            results.push({ action: 'delete', id: op.id, success: false, error: 'Not found/owned/locked' });
            continue;
          }
          await prisma.blockObject.delete({ where: { id: op.id } });
          results.push({ action: 'delete', id: op.id, success: true });
        }
      } catch (e) {
        results.push({ action: op.action, id: op.id, success: false, error: 'Operation failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[World Batch]', err);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
