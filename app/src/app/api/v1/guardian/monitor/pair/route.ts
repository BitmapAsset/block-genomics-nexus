import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validateMonitorToken } from '@/lib/monitor-tokens';

/**
 * POST /api/v1/guardian/monitor/pair
 * First-use pairing: locks the monitor token to a wallet address.
 * After pairing, the token can only be used from the paired wallet.
 * 
 * Body: { guardianId, walletAddress, webhookUrl? }
 * Auth: Bearer <monitor-token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return error('Missing authorization', 401);
    }
    const token = authHeader.slice(7);

    const { guardianId, walletAddress, webhookUrl } = await req.json();

    if (!guardianId || !walletAddress) {
      return error('guardianId and walletAddress are required');
    }

    // Validate token
    const valid = await validateMonitorToken(token, guardianId);
    if (!valid) return error('Invalid token', 401);

    // Get guardian
    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
      select: {
        id: true,
        name: true,
        blockHeight: true,
        ownerAddress: true,
        monitorPairedAt: true,
        monitorPairedWallet: true,
        status: true,
      },
    });

    if (!guardian) return error('Guardian not found', 404);

    // If already paired to a DIFFERENT wallet, reject
    if (guardian.monitorPairedWallet && guardian.monitorPairedWallet !== walletAddress) {
      return error('Token already paired to a different wallet. Revoke and regenerate to re-pair.', 403);
    }

    // Verify the wallet matches the guardian owner
    // Parse ownerAddress (might be JSON with type+address)
    let ownerAddr = guardian.ownerAddress;
    try {
      const parsed = JSON.parse(ownerAddr);
      ownerAddr = parsed.address || ownerAddr;
    } catch {
      // Already a plain address
    }

    if (ownerAddr !== walletAddress) {
      return error('Wallet does not match guardian owner', 403);
    }

    // Pair!
    await prisma.guardianAgent.update({
      where: { id: guardianId },
      data: {
        monitorPairedAt: guardian.monitorPairedAt || new Date(),
        monitorPairedWallet: walletAddress,
        monitorWebhookUrl: webhookUrl || null,
      },
    });

    return success({
      paired: true,
      guardianId: guardian.id,
      guardianName: guardian.name,
      blockHeight: guardian.blockHeight,
      status: guardian.status,
      message: `Successfully paired to Guardian "${guardian.name}" on block ${guardian.blockHeight}`,
    });
  } catch (e: unknown) {
    console.error('Pair error:', e);
    return error('Pairing failed', 500);
  }
}
