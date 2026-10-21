import { prisma } from '@/lib/prisma';
import { countVerifiedAgents } from '@/lib/directory-counts';

/**
 * The public network counters: one reader for /api/v1/stats and for the
 * footer numbers the root layout renders on the server.
 */
export interface PublicStats {
  verifiedAgents: number;
  genomesMinted: number;
  blocksVerified: number;
}

export async function readPublicStats(): Promise<PublicStats> {
  const [verifiedAgents, genomesMinted, blocksVerified] = await Promise.all([
    // Verified agents = verified Users + verified BlockProfiles (shared source
    // of truth with /api/v1/users/list so the two endpoints always agree).
    countVerifiedAgents(),
    // Verified agents that have minted a genome.
    prisma.user.count({ where: { verified: true, genomeHash: { not: null } } }),
    // Blocks that have been verified/claimed
    prisma.block.count(),
  ]);
  return { verifiedAgents, genomesMinted, blocksVerified };
}
