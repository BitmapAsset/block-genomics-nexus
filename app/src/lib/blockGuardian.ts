/**
 * The public face of a block's guardian, for the block page's Guardian tab.
 *
 * Selects display fields only. The guardian row also carries the owner's LLM
 * key, soul/memory files and monitor token hash; none of that may reach a
 * public page, so the select list is explicit rather than a spread.
 */

import prisma from '@/lib/prisma';

export interface BlockGuardianSummary {
  name: string;
  status: string;
  /** True when the guardian's status says it is running. Not a liveness probe. */
  active: boolean;
  lastHeartbeat: string | null;
  totalMessages: number;
  totalVisitors: number;
}

export interface BlockGuardianView {
  guardian: BlockGuardianSummary | null;
  /** A block profile handle, for the public chat page at /agent/{handle}. */
  handle: string | null;
  /** True when the lookup failed, so the tab says so instead of "no guardian". */
  degraded: boolean;
}

const isActive = (status: string) => status === 'active' || status === 'Online';

export async function fetchBlockGuardian(height: number): Promise<BlockGuardianView> {
  try {
    const [guardian, profile] = await Promise.all([
      prisma.guardianAgent.findFirst({
        where: { blockHeight: height },
        orderBy: { createdAt: 'asc' },
        select: { name: true, status: true, lastHeartbeat: true, totalMessages: true, totalVisitors: true },
      }),
      prisma.blockProfile.findFirst({
        where: { blockHeight: height },
        orderBy: { createdAt: 'asc' },
        select: { handle: true },
      }),
    ]);

    return {
      guardian: guardian
        ? {
            name: guardian.name,
            status: guardian.status,
            active: isActive(guardian.status),
            lastHeartbeat: guardian.lastHeartbeat ? guardian.lastHeartbeat.toISOString() : null,
            totalMessages: guardian.totalMessages,
            totalVisitors: guardian.totalVisitors,
          }
        : null,
      handle: profile?.handle ?? null,
      degraded: false,
    };
  } catch {
    return { guardian: null, handle: null, degraded: true };
  }
}
