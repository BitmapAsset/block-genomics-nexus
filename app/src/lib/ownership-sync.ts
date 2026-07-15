/**
 * On-Chain Ownership Sync System
 * 
 * Blockchain is truth. Our DB is a cache.
 * If inscription moved on-chain, DB must update.
 */

import prisma from '@/lib/prisma';
import { getInscriptionOwner as ordGetInscriptionOwner, getStatus as ordGetStatus } from '@/lib/onchain/ord';

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
  /**
   * true ONLY when a live on-chain owner was fetched and equals the DB owner.
   * false on a real on-chain mismatch. When the indexer is down (no on-chain
   * owner), `match` is false and `indeterminate` is true — so an outage is
   * never reported as a match that would suppress future retries.
   */
  match: boolean;
  /**
   * true when we could NOT establish on-chain truth (no inscription linked, or
   * the indexer returned no owner). Callers should retry later and must NOT act.
   */
  indeterminate: boolean;
  action: 'none' | 'update' | 'revoke';
}

export interface TransferEvent {
  blockHeight: number;
  previousOwner: string;
  newOwner: string;
  inscriptionId: string;
  detectedAt: Date;
}

// ─── Cache ───────────────────────────────────────────────────────
// Owner lookups dedupe within a cron batch. The ord client owns request
// throttling (~1 req/sec), so there's no local rate-limited fetch here.

const ownerCache = new Map<string, { address: string | null; satpoint: string | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Get the current on-chain owner of a .bitmap inscription via the ord server
 * JSON client (ordinals.com `/inscription/<id>` → `address`).
 *
 * FAILS CLOSED: returns null when the ord server is down / non-200 / unparsable.
 * A null here means "on-chain truth unavailable", NOT "no owner" — callers must
 * never treat null as a match or a transfer trigger. The brittle HTML-regex
 * scrape fallback was removed; a single typed indexer is the only owner source.
 */
export async function getInscriptionOwner(inscriptionId: string): Promise<string | null> {
  // Check cache
  const cached = ownerCache.get(inscriptionId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.address;
  }

  const owner = await ordGetInscriptionOwner(inscriptionId);
  const address = owner?.address ?? null;
  const satpoint = owner?.satpoint ?? null;

  // Cache result (including a null/"unavailable" result, to avoid hammering the
  // indexer when it's down — TTL bounds how long we stay pessimistic).
  ownerCache.set(inscriptionId, { address, satpoint, ts: Date.now() });
  return address;
}

/**
 * Freshness gate before acting on a transfer.
 *
 * A positive owner address from the holder endpoint already proves the indexer
 * is live and answering, so this is a secondary sanity check: it FAILS CLOSED
 * only on a definitively bad tip (height <= 0). If `/status` itself is merely
 * unreachable it returns true (fail OPEN) — we do NOT block a transfer that a
 * live, positive holder lookup already justified, because that would strand a
 * legitimate buyer whenever the status endpoint flaps independently.
 */
async function indexerTipIsSane(): Promise<boolean> {
  const status = await ordGetStatus();
  if (status === null) return true; // status unreachable — defer to the positive holder proof
  return status.height > 0;
}

/**
 * Verify ownership of a specific block
 */
export async function verifyBlockOwnership(blockHeight: number): Promise<OwnershipCheck> {
  const block = await prisma.block.findUnique({ where: { height: blockHeight } });

  if (!block) {
    // No such block on record — nothing to verify, nothing to act on.
    return {
      blockHeight,
      dbOwnerAddress: null,
      onChainOwnerAddress: null,
      inscriptionId: null,
      match: false,
      indeterminate: true,
      action: 'none',
    };
  }

  const inscriptionId = block.inscriptionId;

  if (!inscriptionId) {
    // No inscription linked — can't verify on-chain. Treat as indeterminate
    // (not a positive ownership proof) so no caller skips the on-chain check.
    return {
      blockHeight,
      dbOwnerAddress: block.ownerAddress,
      onChainOwnerAddress: null,
      inscriptionId: null,
      match: false,
      indeterminate: true,
      action: 'none',
    };
  }

  const onChainOwner = await getInscriptionOwner(inscriptionId);

  // Update lastOwnerCheck
  await prisma.block.update({
    where: { height: blockHeight },
    data: { lastOwnerCheck: new Date() },
  });

  // FAIL CLOSED: when the indexer returns no owner (down / non-200 / unparsable)
  // this is INDETERMINATE — not a match, not a transfer. `match` is true ONLY on
  // a live, positive equality, so an outage can never be reported as "match"
  // (which would suppress future retries) nor as a mismatch (which could trigger
  // a bogus transfer). A real mismatch (live owner != DB owner) ⇒ action:'update'.
  if (!onChainOwner) {
    return {
      blockHeight,
      dbOwnerAddress: block.ownerAddress,
      onChainOwnerAddress: null,
      inscriptionId,
      match: false,
      indeterminate: true,
      action: 'none', // retry later, do NOT act on an outage
    };
  }

  const match = onChainOwner === block.ownerAddress;

  return {
    blockHeight,
    dbOwnerAddress: block.ownerAddress,
    onChainOwnerAddress: onChainOwner,
    inscriptionId,
    match,
    indeterminate: false,
    action: match ? 'none' : 'update',
  };
}

/**
 * Process an ownership transfer.
 *
 * A block/land sale is a BLANK-SLATE transfer: the buyer receives clean land.
 * The seller's identity, trained guardian, and any secrets are RELEASED — never
 * handed to the buyer. Release is enforced here unconditionally, regardless of
 * whether/how the seller "prepped" the block, so a seller can never opt to pass
 * a trained agent or live API keys to the new owner.
 */
export async function processOwnershipTransfer(
  blockHeight: number,
  newOwnerAddress: string,
  inscriptionId: string
): Promise<TransferEvent> {
  const block = await prisma.block.findUnique({ where: { height: blockHeight } });
  const previousOwner = block?.ownerAddress || 'unknown';

  // The release and the ownership flip must be ATOMIC. If the flip happened first
  // and any later release step threw, the block would belong to the buyer while the
  // seller's trained guardian + secrets stayed intact — and because verifyBlockOwnership
  // would then see db owner == on-chain owner, the cron would report match and NEVER
  // retry, leaking those secrets permanently. One transaction with the flip performed
  // LAST guarantees that any failure rolls back the flip, the seller keeps the block,
  // and the next sync retries the whole release.
  const transfer = await prisma.$transaction(async (tx) => {
    // 1. Release the seller's BlockProfile identity for this block.
    //    `handle` is required + globally unique, so it can't be nulled in place;
    //    deleting the row frees the handle and clears displayName/bio/avatar/genome
    //    so the buyer starts with no identity attached to the land. Scoped to NOT
    //    the buyer so an incoming owner's own records are never touched.
    await tx.blockProfile.deleteMany({
      where: { blockHeight, walletAddress: { not: newOwnerAddress } },
    });

    // 2. Wipe the guardian agent(s): soul, skills, memory, personality, every LLM/
    //    API key, endpoints, monitor pairing + escalation contacts, and stats. The
    //    buyer must NOT inherit a trained agent or any secret. We wipe in place
    //    (not merely pause), leaving a blank, released shell.
    await tx.guardianAgent.updateMany({
      where: { blockHeight, ownerAddress: { not: newOwnerAddress } },
      data: {
        name: 'Guardian',
        soulMd: '',
        agentMd: null,
        skillsMd: null,
        memoryMd: null,
        personality: null,
        llmProvider: null,
        llmModel: null,
        llmApiKey: null,
        llmEndpoint: null,
        selfHosted: false,
        agentEndpoint: null,
        endpointVerified: false,
        lastHeartbeat: null,
        autoResponses: null,
        escalateTelegram: null,
        escalateEmail: null,
        autoApproveDelegationUnder: null,
        configJson: null,
        monitorTokenCreatedAt: null,
        monitorTokenHash: null,
        monitorPairedAt: null,
        monitorPairedWallet: null,
        monitorWebhookUrl: null,
        graceDeadline: null,
        totalVisitors: 0,
        totalMessages: 0,
        status: 'released',
      },
    });

    // 3. Delete the seller's guardian conversation history AND escalation events.
    //    Both carry visitor PII / message content and are reachable via the public
    //    guardian + guardian/events read paths, so both must go on release.
    const releasedGuardians = await tx.guardianAgent.findMany({
      where: { blockHeight, ownerAddress: { not: newOwnerAddress } },
      select: { id: true },
    });
    if (releasedGuardians.length > 0) {
      const guardianIds = releasedGuardians.map(g => g.id);
      await tx.guardianConversation.deleteMany({ where: { guardianId: { in: guardianIds } } });
      await tx.guardianEvent.deleteMany({ where: { guardianId: { in: guardianIds } } });
    }

    // 4. Detach BitmapAgent + VPSLink associations for this block. Their block/
    //    wallet references are non-nullable and the rows carry the seller's server
    //    endpoint URLs, so the only way to truly detach (without leaking infra) is
    //    to remove the rows. BitmapAgent children cascade. (See schema note.)
    await tx.bitmapAgent.deleteMany({
      where: { blockHeight, walletAddress: { not: newOwnerAddress } },
    });
    await tx.vPSLink.deleteMany({
      where: { blockHeight, walletAddress: { not: newOwnerAddress } },
    });
    // Experiences are the first-class successor to VPSLink and likewise carry the
    // seller's self-hosted endpoint URLs — release them on sale so a buyer never
    // inherits (nor can the seller keep controlling) an experience on sold land.
    await tx.experience.deleteMany({
      where: { blockHeight, walletAddress: { not: newOwnerAddress } },
    });

    // 5. Cancel active delegations + listings (no longer the seller's to grant).
    await tx.delegation.updateMany({
      where: { blockHeight, active: true },
      data: { active: false },
    });
    await tx.delegationListing.updateMany({
      where: { blockHeight, active: true },
      data: { active: false },
    });

    // 6. Detach the seller's ACCOUNT identity from this block. Deleting the
    //    BlockProfile is not enough: a single-block Tier-1 seller keeps
    //    User.anchorBlock + genomeHash pointing at the sold block, which (a) keeps
    //    their genome attached to the block in the public directory and (b) lets
    //    auth/verify skip the on-chain check and silently re-claim the sold block.
    //    Nulling anchorBlock + genomeHash closes both. Scoped to the seller AND
    //    this block, so a seller anchored to a DIFFERENT block is left untouched.
    if (previousOwner !== 'unknown') {
      await tx.user.updateMany({
        where: { walletAddress: previousOwner, anchorBlock: blockHeight },
        data: { anchorBlock: null, genomeHash: null },
      });
    }

    // 7. Flip the land to the new owner — LAST, so it commits only if every
    //    release step above succeeded.
    await tx.block.update({
      where: { height: blockHeight },
      data: {
        ownerAddress: newOwnerAddress,
        lastOwnerCheck: new Date(),
        transferPrepped: false,
      },
    });

    // 8. Log the transfer as a blank-slate release (not a kept/paused handover).
    const created = await tx.ownershipTransfer.create({
      data: {
        blockHeight,
        inscriptionId,
        previousOwner,
        newOwner: newOwnerAddress,
        buildingsKept: true,    // buildings/terrain stay with the land (separate chunk)
        guardiansKept: false,   // guardian soul/skills/keys wiped — released, not kept
        guardiansPaused: false, // released, not merely paused
      },
    });

    // 9. If the new owner has a profile and no anchor yet, set their anchorBlock.
    const existingUser = await tx.user.findUnique({ where: { walletAddress: newOwnerAddress } });
    if (existingUser && !existingUser.anchorBlock) {
      await tx.user.update({
        where: { walletAddress: newOwnerAddress },
        data: { anchorBlock: blockHeight, tier: 1 },
      });
    }

    return created;
  }, { timeout: 15000 });

  console.log(`[ownership-sync] Blank-slate transfer: block ${blockHeight} released from ${previousOwner.slice(0, 12)}... to ${newOwnerAddress.slice(0, 12)}...`);

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

    // Process transfer only on a live mismatch (action 'update' is set ONLY for a
    // positive on-chain owner that differs from the DB owner; an outage is
    // 'none'). Gate on a sane indexer tip before acting.
    if (check.action === 'update' && check.onChainOwnerAddress && check.inscriptionId) {
      if (await indexerTipIsSane()) {
        await processOwnershipTransfer(height, check.onChainOwnerAddress, check.inscriptionId);
      } else {
        console.warn(`[ownership-sync] Skipped transfer for block ${height}: indexer tip not sane`);
      }
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

  // If on-chain shows this wallet is owner but DB disagrees, sync.
  // Requires a live, positive on-chain owner equal to the wallet (null owner on
  // an outage can never equal the wallet), gated on a sane indexer tip.
  if (check.onChainOwnerAddress === walletAddress && !check.match && check.inscriptionId) {
    if (await indexerTipIsSane()) {
      await processOwnershipTransfer(blockHeight, walletAddress, check.inscriptionId);
      return { isOwner: true, check };
    }
    // Indexer tip not sane — do not transfer on this run; report not-owner so the
    // caller fails closed and retries later.
    return { isOwner: false, check };
  }

  // If on-chain matches DB and DB matches wallet
  if (check.dbOwnerAddress === walletAddress && check.match) {
    return { isOwner: true, check };
  }

  return { isOwner: false, check };
}
