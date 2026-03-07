import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { generateMonitorToken, revokeMonitorToken } from '@/lib/monitor-tokens';

export async function POST(req: NextRequest) {
  try {
    const { guardianId, ownerAddress, signature, message } = await req.json();

    if (!guardianId || !ownerAddress || !signature || !message) {
      return error('Missing required fields: guardianId, ownerAddress, signature, message');
    }

    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
    });

    if (!guardian) return error('Guardian not found', 404);
    if (guardian.ownerAddress !== ownerAddress) {
      return error('Owner address mismatch', 403);
    }

    const token = await generateMonitorToken(guardianId, ownerAddress);

    return success({ token, guardianId, expiresAt: null });
  } catch (e: any) {
    return error(e.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { guardianId, ownerAddress, signature, message } = await req.json();

    if (!guardianId || !ownerAddress || !signature || !message) {
      return error('Missing required fields: guardianId, ownerAddress, signature, message');
    }

    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
    });

    if (!guardian) return error('Guardian not found', 404);
    if (guardian.ownerAddress !== ownerAddress) {
      return error('Owner address mismatch', 403);
    }

    await revokeMonitorToken(guardianId);

    return success({ revoked: true, guardianId });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
