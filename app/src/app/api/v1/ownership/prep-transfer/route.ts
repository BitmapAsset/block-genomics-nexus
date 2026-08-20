import { NextRequest } from 'next/server';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { wipeGuardianMemories, type MemoryWipeOption } from '@/lib/ownership-sync';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';

/**
 * POST /api/v1/ownership/prep-transfer
 * Prepare a block for transfer — wipe guardian memories before selling
 * 
 * Body: { blockHeight, walletAddress, signature, message, wipeOption: 'full' | 'selective' | 'none' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, walletAddress, signature, message, wipeOption } = body;

    if (!blockHeight || !walletAddress || !signature || !message) {
      return error('blockHeight, walletAddress, signature, message required', 400);
    }

    if (!['full', 'selective', 'none'].includes(wipeOption)) {
      return error('wipeOption must be full, selective, or none', 400);
    }

    // Verify signature
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // OWNERSHIP — asked of the chain, not of our cache. This route DESTROYS
    // guardian memory, so the stale window matters more here than anywhere: once
    // a block is sold, `Block.ownerAddress` still names the seller until the next
    // background sync, and authorizing from it let a seller wipe the buyer's
    // guardian on land they no longer owned. An outage is a retryable 503.
    const owns = await requireLiveBlockOwner(walletAddress, blockHeight);
    if (!owns.ok) {
      return error(owns.reason ?? 'Not the block owner', owns.status);
    }

    // Perform wipe
    const result = await wipeGuardianMemories(blockHeight, wipeOption as MemoryWipeOption, walletAddress);

    return success({
      blockHeight,
      wipeOption,
      guardiansWiped: result.wiped,
      prepped: true,
      message: wipeOption === 'full'
        ? `${result.wiped} guardian(s) memory cleared. Block is ready for transfer.`
        : wipeOption === 'none'
          ? 'Block marked for transfer as-is. All memories will pass to new owner.'
          : `Block prepped. ${result.wiped} guardian(s) marked for selective wipe.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to prep transfer';
    return error(msg, 500);
  }
}
