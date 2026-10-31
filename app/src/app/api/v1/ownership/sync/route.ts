import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';
import { verifyBlockOwnership, processOwnershipTransfer, holderMayTriggerTransfer } from '@/lib/ownership-sync';

/**
 * POST /api/v1/ownership/sync
 * Trigger ownership sync for a block
 * Requires wallet signature from current DB owner OR the new on-chain owner
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight } = body;

    if (!walletAddress || !signature || !message) {
      return error('walletAddress, signature, and message are required', 400);
    }
    if (!blockHeight) {
      return error('blockHeight is required', 400);
    }

    // The canonical 'ownership.sync' message for this block, with a one-time
    // 'ownership' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'ownership.sync', method: 'POST', path: '/api/v1/ownership/sync',
      blockHeight: Number(blockHeight), purpose: 'ownership',
    });
    if (!auth.ok) return error(auth.error, auth.status);

    // Verify caller is either current DB owner or on-chain owner
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block) {
      return error(`Block ${blockHeight} not found`, 404);
    }

    // AUTH tier: this result decides both who may call the sync and whether a
    // transfer is executed, so it must not be decided on a stale observation.
    const check = await verifyBlockOwnership(blockHeight, 'auth');

    // Caller must be either DB owner or on-chain owner
    const isDbOwner = block.ownerAddress === walletAddress;
    const isOnChainOwner = check.onChainOwnerAddress === walletAddress;
    if (!isDbOwner && !isOnChainOwner) {
      return error('You must be either the current DB owner or the on-chain owner to trigger sync', 403);
    }

    // Process transfer if mismatch
    if (!check.match && check.onChainOwnerAddress && check.inscriptionId) {
      if (!holderMayTriggerTransfer(check)) {
        return success({
          transferred: false,
          deferred: true,
          message: 'The live holder was derived from Esplora while ord hosts are unreachable; the transfer waits until an ord host confirms it. Retry later.',
        });
      }
      // The same rule as the cron: a transfer runs only on `action: 'update'`.
      // With the deed cross-check configured, a mismatch it has not confirmed
      // comes back as `none` + `transferDeferred` and waits for a later run.
      if (check.action !== 'update') {
        return success({
          transferred: false,
          deferred: true,
          message: 'The transfer waits until the deed is confirmed. Retry later.',
        });
      }
      const transfer = await processOwnershipTransfer(
        blockHeight,
        check.onChainOwnerAddress,
        check.inscriptionId
      );
      return success({ transferred: true, transfer });
    }

    return success({ transferred: false, message: 'Ownership matches — no sync needed' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
