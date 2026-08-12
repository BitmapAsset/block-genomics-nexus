import prisma from '@/lib/prisma';

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

interface ScanResult {
  type: 'block' | 'parcel';
  height: number;
  parcelIndex?: number;
  inscriptionId: string;
}

async function scanOnChain(address: string, baseUrl: string): Promise<ScanResult[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/inscriptions/scan?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data?.inscriptions || []) as ScanResult[];
  } catch {
    return [];
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
 * @param options.baseUrl - API base URL for inscription scanning
 * @returns Full tier resolution with owned assets, previous tier, and change info
 */
export async function resolveTier(
  walletAddress: string,
  options: { force?: boolean; baseUrl?: string } = {}
): Promise<TierResolution> {
  const { force = false, baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000' } = options;

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

  if (needsScan) {
    const inscriptions = await scanOnChain(walletAddress, baseUrl);
    const now = new Date();

    // Extract blocks and parcels from scan (retain inscriptionId so the ownership
    // cron — which only re-checks blocks that HAVE one — can see scan-found blocks)
    const scannedBlockRecords = inscriptions.filter(i => i.type === 'block');
    const scannedBlocks = scannedBlockRecords.map(i => i.height);
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
    // Update Block ownership in DB — persist inscriptionId from the scan so these
    // wallet-scan-discovered blocks become eligible for the ownership re-check cron.
    for (const { height, inscriptionId } of scannedBlockRecords) {
      await prisma.block.upsert({
        where: { height },
        create: {
          height,
          ownerAddress: walletAddress,
          lastOwnerCheck: now,
          ...(inscriptionId && { inscriptionId }),
        },
        update: {
          ownerAddress: walletAddress,
          lastOwnerCheck: now,
          ...(inscriptionId && { inscriptionId }),
        },
      });
    }
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
