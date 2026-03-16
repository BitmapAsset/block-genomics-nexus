/**
 * On-Chain Ownership Sync System
 * 
 * Blockchain is truth. Our DB is a cache.
 * If inscription moved on-chain, DB must update.
 */

import prisma from '@/lib/prisma';

// ─── Memory Wipe Types ──────────────────────────────────────────

export type MemoryWipeOption = 'full' | 'selective' | 'none';

/**
 * Wipe guardian agent memories before transfer
 * - 'full': Clear MEMORY.md + reset conversation count. Keep SOUL.md, AGENT.md, SKILLS.md
 * - 'selective': Owner already cleaned up manually (we just mark it prepped)
 * - 'none': Transfer as-is — everything passes to new owner (premium option)
 */
export async function wipeGuardianMemories(
  blockHeight: number,
  wipeOption: MemoryWipeOption,
  ownerAddress: string,
): Promise<{ wiped: number }> {
  if (wipeOption === 'none') return { wiped: 0 };

  const guardians = await prisma.guardianAgent.findMany({
    where: { blockHeight, ownerAddress },
  });

  if (wipeOption === 'full') {
    // Full wipe: clear memory, reset conversations
    for (const g of guardians) {
      await prisma.guardianAgent.update({
        where: { id: g.id },
        data: {
          memoryMd: `# MEMORY.md — ${g.name}\n\n*This agent was prepared for transfer on ${new Date().toISOString().split('T')[0]}.*\n*Previous memories were cleared at the former owner's request.*\n*Ready to learn and serve my new owner.*\n\n---\n`,
          totalMessages: 0,
        },
      });
    }
    // Clear conversation history
    await prisma.guardianConversation.deleteMany({
      where: { guardianId: { in: guardians.map(g => g.id) } },
    });
  }

  // Mark block as transfer-prepped
  await prisma.block.update({
    where: { height: blockHeight },
    data: { transferPrepped: true },
  });

  return { wiped: guardians.length };
}

// ─── Types ───────────────────────────────────────────────────────

export interface OwnershipCheck {
  blockHeight: number;
  dbOwnerAddress: string | null;
  onChainOwnerAddress: string | null;
  inscriptionId: string | null;
  match: boolean;
  action: 'none' | 'update' | 'revoke';
}

export interface TransferEvent {
  blockHeight: number;
  previousOwner: string;
  newOwner: string;
  inscriptionId: string;
  detectedAt: Date;
}

// ─── Rate Limiting & Cache ───────────────────────────────────────

const ownerCache = new Map<string, { address: string | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let lastRequestTs = 0;
const MIN_REQUEST_INTERVAL_MS = 1100; // ~1 req/sec

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestTs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTs = Date.now();
  return fetch(url, init);
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Get the current on-chain owner of a .bitmap inscription
 */
export async function getInscriptionOwner(inscriptionId: string): Promise<string | null> {
  // Check cache
  const cached = ownerCache.get(inscriptionId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.address;
  }

  let address: string | null = null;

  // Try ordinals.com API
  try {
    const res = await rateLimitedFetch(`https://ordinals.com/api/inscription/${inscriptionId}`);
    if (res.ok) {
      const data = await res.json();
      address = data.address || null;
    }
  } catch (e) {
    console.warn('[ownership-sync] ordinals.com API failed:', e);
  }

  // Fallback: parse HTML page
  if (!address) {
    try {
      const res = await rateLimitedFetch(`https://ordinals.com/inscription/${inscriptionId}`, {
        headers: { Accept: 'text/html' },
      });
      if (res.ok) {
        const html = await res.text();
        // Look for address in the HTML (typically in a <dd> after "address" <dt>)
        const match = html.match(/address[^<]*<\/dt>\s*<dd[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i)
          || html.match(/(bc1[a-zA-HJ-NP-Z0-9]{25,90})/);
        if (match) address = match[1].trim();
      }
    } catch (e) {
      console.warn('[ownership-sync] ordinals.com HTML fallback failed:', e);
    }
  }

  // Cache result
  ownerCache.set(inscriptionId, { address, ts: Date.now() });
  return address;
}

/**
 * Verify ownership of a specific block
 */
export async function verifyBlockOwnership(blockHeight: number): Promise<OwnershipCheck> {
  const block = await prisma.block.findUnique({ where: { height: blockHeight } });

  if (!block) {
    return {
      blockHeight,
      dbOwnerAddress: null,
      onChainOwnerAddress: null,
      inscriptionId: null,
      match: true,
      action: 'none',
    };
  }

  const inscriptionId = block.inscriptionId;

  if (!inscriptionId) {
    // No inscription linked — can't verify on-chain
    return {
      blockHeight,
      dbOwnerAddress: block.ownerAddress,
      onChainOwnerAddress: null,
      inscriptionId: null,
      match: true, // assume match if we can't check
      action: 'none',
    };
  }

  const onChainOwner = await getInscriptionOwner(inscriptionId);

  // Update lastOwnerCheck
  await prisma.block.update({
    where: { height: blockHeight },
    data: { lastOwnerCheck: new Date() },
  });

  const match = !onChainOwner || onChainOwner === block.ownerAddress;

  return {
    blockHeight,
    dbOwnerAddress: block.ownerAddress,
    onChainOwnerAddress: onChainOwner,
    inscriptionId,
    match,
    action: !match && onChainOwner ? 'update' : 'none',
  };
}

/**
 * Process an ownership transfer
 */
export async function processOwnershipTransfer(
  blockHeight: number,
  newOwnerAddress: string,
  inscriptionId: string
): Promise<TransferEvent> {
  const block = await prisma.block.findUnique({ where: { height: blockHeight } });
  const previousOwner = block?.ownerAddress || 'unknown';

  // 1. Update block owner
  await prisma.block.update({
    where: { height: blockHeight },
    data: {
      ownerAddress: newOwnerAddress,
      lastOwnerCheck: new Date(),
    },
  });

  // 2. If owner didn't prep, apply default full memory wipe for privacy
  const blockData = await prisma.block.findUnique({ where: { height: blockHeight } });
  if (!blockData?.transferPrepped) {
    await wipeGuardianMemories(blockHeight, 'full', previousOwner);
  }
  // Reset transfer prep flag
  await prisma.block.update({ where: { height: blockHeight }, data: { transferPrepped: false } });

  // 3. Pause all Guardian Agents on this block
  await prisma.guardianAgent.updateMany({
    where: { blockHeight, status: 'active' },
    data: { status: 'paused_transfer' },
  });

  // 3. Cancel active delegations
  await prisma.delegation.updateMany({
    where: { blockHeight, active: true },
    data: { active: false },
  });

  // 4. Deactivate delegation listings
  await prisma.delegationListing.updateMany({
    where: { blockHeight, active: true },
    data: { active: false },
  });

  // 5. Log transfer event
  const transfer = await prisma.ownershipTransfer.create({
    data: {
      blockHeight,
      inscriptionId,
      previousOwner,
      newOwner: newOwnerAddress,
      buildingsKept: true,
      guardiansKept: true,
      guardiansPaused: true,
    },
  });

  // 6. If new owner has a profile, update their anchorBlock
  const existingUser = await prisma.user.findUnique({ where: { walletAddress: newOwnerAddress } });
  if (existingUser && !existingUser.anchorBlock) {
    await prisma.user.update({
      where: { walletAddress: newOwnerAddress },
      data: { anchorBlock: blockHeight, tier: 1 },
    });
  }

  console.log(`[ownership-sync] Transfer detected: block ${blockHeight} from ${previousOwner.slice(0, 12)}... to ${newOwnerAddress.slice(0, 12)}...`);

  return {
    blockHeight,
    previousOwner,
    newOwner: newOwnerAddress,
    inscriptionId,
    detectedAt: transfer.detectedAt,
  };
}

/**
 * Batch verify multiple blocks
 */
export async function batchVerifyOwnership(blockHeights: number[]): Promise<OwnershipCheck[]> {
  const results: OwnershipCheck[] = [];
  for (const height of blockHeights) {
    const check = await verifyBlockOwnership(height);
    results.push(check);

    // Process transfer if mismatch found
    if (check.action === 'update' && check.onChainOwnerAddress && check.inscriptionId) {
      await processOwnershipTransfer(height, check.onChainOwnerAddress, check.inscriptionId);
    }
  }
  return results;
}

/**
 * Verify and sync a block — used as fallback in delegation routes
 * Returns whether the given wallet is the owner after sync
 */
export async function verifyAndSyncBlock(
  blockHeight: number,
  walletAddress: string
): Promise<{ isOwner: boolean; check: OwnershipCheck }> {
  const check = await verifyBlockOwnership(blockHeight);

  // If on-chain shows this wallet is owner but DB disagrees, sync
  if (check.onChainOwnerAddress === walletAddress && !check.match && check.inscriptionId) {
    await processOwnershipTransfer(blockHeight, walletAddress, check.inscriptionId);
    return { isOwner: true, check };
  }

  // If on-chain matches DB and DB matches wallet
  if (check.dbOwnerAddress === walletAddress && check.match) {
    return { isOwner: true, check };
  }

  return { isOwner: false, check };
}
