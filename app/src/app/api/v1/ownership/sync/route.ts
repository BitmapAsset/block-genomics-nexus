import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { verifyBlockOwnership, processOwnershipTransfer } from '@/lib/ownership-sync';

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

    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // Verify caller is either current DB owner or on-chain owner
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block) {
      return error(`Block ${blockHeight} not found`, 404);
    }

    const check = await verifyBlockOwnership(blockHeight);

    // Caller must be either DB owner or on-chain owner
    const isDbOwner = block.ownerAddress === walletAddress;
    const isOnChainOwner = check.onChainOwnerAddress === walletAddress;
    if (!isDbOwner && !isOnChainOwner) {
      return error('You must be either the current DB owner or the on-chain owner to trigger sync', 403);
    }

    // Process transfer if mismatch
    if (!check.match && check.onChainOwnerAddress && check.inscriptionId) {
      const transfer = await processOwnershipTransfer(
        blockHeight,
        check.onChainOwnerAddress,
        check.inscriptionId
      );
      return success({ transferred: true, transfer });
    }

    return success({ transferred: false, message: 'Ownership matches — no sync needed' });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
