import prisma from '@/lib/prisma';
import { scanAddressForBitmaps, type BitmapResult } from '@/lib/inscription-scan';

export interface TierResolution {
  globalTier: 0 | 1 | 2 | 3;
  ownedBlocks: number[];
  ownedParcels: { blockHeight: number; txIndex: number }[];
  activeDelegations: { blockHeight: number; expiresAt: string; tier: 3 }[];
  previousTier: number | null;
  tierChanged: boolean;
  changeType: 'upgrade' | 'downgrade' | 'none';
  lastOnChainCheck: string;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * `null` means the scan could not answer — never "the wallet holds nothing".
 *
 * In-process, not an HTTP call to our own `/inscriptions/scan`: that call went
 * to the origin of the request being served, so a forged Host header chose the
 * server that answered, and its answer became the wallet's tier.
 */
async function scanOnChain(address: string): Promise<BitmapResult[] | null> {
  try {
    const scan = await scanAddressForBitmaps(address);
    return scan.ok ? scan.inscriptions : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a wallet's highest verification tier by scanning on-chain inscriptions.
 *
 * Checks owned blocks (Tier 1), parcels (Tier 2), and active delegations (Tier 3).
 * Caches on-chain results for 24 hours. Applies 7-day grace period on Tier 1 downgrade.
 *
 * @param walletAddress - Bitcoin wallet address to resolve
 * @param options.force - Skip stale check and force on-chain re-scan
 * @returns Full tier resolution with owned assets, previous tier, and change info
 */
export async function resolveTier(
  walletAddress: string,
  options: { force?: boolean } = {}
): Promise<TierResolution> {
  const { force = false } = options;

  // Get or create user
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  const previousTier = user?.resolvedTier ?? null;

  // Get active delegations
  const delegations = await prisma.delegation.findMany({
    where: {
      delegateeAddress: walletAddress,
      active: true,
      endDate: { gt: new Date() },
    },
  });

  const activeDelegations = delegations.map(d => ({
    blockHeight: d.blockHeight,
    expiresAt: d.endDate.toISOString(),
    tier: 3 as const,
  }));

  // Determine if on-chain scan needed
  const lastCheck = user?.lastOnChainCheck;
  const isStale = !lastCheck || (Date.now() - lastCheck.getTime()) > STALE_THRESHOLD_MS;
  const needsScan = force || isStale;

  let ownedBlocks: number[] = user?.ownedBlocks ?? [];
  let ownedParcels: { blockHeight: number; txIndex: number }[] = [];

  // Get existing parcels from DB
  const dbParcels = await prisma.parcel.findMany({
    where: { ownerAddress: walletAddress },
    select: { blockHeight: true, txIndex: true },
  });
  ownedParcels = dbParcels.map(p => ({ blockHeight: p.blockHeight, txIndex: p.txIndex }));

  // A failed scan keeps the cached answer: wiping it would drop a real owner to
  // tier 0 (and start their agents' grace period) because an indexer blinked.
  const inscriptions = needsScan ? await scanOnChain(walletAddress) : null;

  if (inscriptions) {
    const now = new Date();

    const scannedBlocks = inscriptions.filter(i => i.type === 'block').map(i => i.height);
    const scannedParcels = inscriptions
      .filter(i => i.type === 'parcel' && i.parcelIndex !== undefined)
      .map(i => ({ blockHeight: i.height, txIndex: i.parcelIndex! }));

    ownedBlocks = scannedBlocks;
    if (scannedParcels.length > 0) {
      ownedParcels = scannedParcels;
    }

    // Update user record
    if (user) {
      await prisma.user.update({
        where: { walletAddress },
        data: {
          lastOnChainCheck: now,
          ownedBlocks: scannedBlocks,
        },
      });
    }
    // Deliberately NO Block write. `Block.ownerAddress` / `inscriptionId` change
    // only through lib/ownership-sync, whose DB≠chain comparison is what fires
    // the sale release. Writing the scanner's answer here made that comparison
    // read "match" forever after a sale, and let a duplicate-inscription holder
    // take over any block's record (bg48 Q-01).
  }

  // Resolve global tier (highest wins: 1 > 2 > 3 > 0)
  let globalTier: 0 | 1 | 2 | 3 = 0;
  if (ownedBlocks.length > 0) {
    globalTier = 1;
  } else if (ownedParcels.length > 0) {
    globalTier = 2;
  } else if (activeDelegations.length > 0) {
    globalTier = 3;
  }

  const tierChanged = previousTier !== null && previousTier !== globalTier;
  let changeType: 'upgrade' | 'downgrade' | 'none' = 'none';
  if (tierChanged) {
    // Lower number = higher tier (1 is best)
    if (previousTier === 0) {
      changeType = 'upgrade';
    } else if (globalTier === 0) {
      changeType = 'downgrade';
    } else {
      changeType = globalTier < previousTier! ? 'upgrade' : 'downgrade';
    }
  }

  // Update resolved tier in DB
  if (user) {
    await prisma.user.update({
      where: { walletAddress },
      data: { resolvedTier: globalTier },
    });
  }

  // Grace period logic: if downgraded from Tier 1, flag agents
  if (tierChanged && previousTier === 1 && globalTier !== 1) {
    await applyGracePeriod(walletAddress);
  }

  const lastOnChainCheck = user?.lastOnChainCheck?.toISOString() || new Date().toISOString();

  return {
    globalTier,
    ownedBlocks,
    ownedParcels,
    activeDelegations,
    previousTier,
    tierChanged,
    changeType,
    lastOnChainCheck,
  };
}

async function applyGracePeriod(walletAddress: string) {
  const graceDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Flag GuardianAgents
  await prisma.guardianAgent.updateMany({
    where: {
      ownerAddress: walletAddress,
      status: 'active',
    },
    data: { graceDeadline },
  });

  // Flag BitmapAgents
  await prisma.bitmapAgent.updateMany({
    where: {
      walletAddress,
      status: 'active',
    },
    data: { graceDeadline },
  });
}
