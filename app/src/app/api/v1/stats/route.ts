import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { countVerifiedAgents } from '@/lib/directory-counts';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-stats' });
  if (rl.response) return rl.response;

  try {
    const gate = await sandboxGate(req);
    if (gate.response) return gate.response;

    const [verifiedAgents, genomesMinted, blocksVerified] = await Promise.all([
      // Verified agents = verified Users + verified BlockProfiles (shared source
      // of truth with /api/v1/users/list so the two endpoints always agree).
      countVerifiedAgents(),
      // Verified agents that have minted a genome.
      prisma.user.count({ where: { verified: true, genomeHash: { not: null } } }),
      // Blocks that have been verified/claimed
      prisma.block.count(),
    ]);

    return NextResponse.json(
      { verifiedAgents, genomesMinted, blocksVerified },
      { headers: gate.headers }
    );
  } catch {
    return NextResponse.json({ verifiedAgents: 0, genomesMinted: 0, blocksVerified: 0 });
  }
}
