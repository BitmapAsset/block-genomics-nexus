import { NextRequest, NextResponse } from 'next/server';
import { readPublicStats } from '@/lib/public-stats';
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

    const { verifiedAgents, genomesMinted, blocksVerified } = await readPublicStats();

    return NextResponse.json(
      { verifiedAgents, genomesMinted, blocksVerified },
      { headers: gate.headers }
    );
  } catch {
    return NextResponse.json({ verifiedAgents: 0, genomesMinted: 0, blocksVerified: 0 });
  }
}
