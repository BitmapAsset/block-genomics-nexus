import { NextRequest, NextResponse } from 'next/server';
import { cachedStats } from '@/lib/footer-stats';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The footer on every page and LiveStats on / fetch this, so the CDN holds it
// for 30 s. A sandbox-key response keeps its own private header (gate.headers).
const PUBLIC_CACHE = 'public, s-maxage=30, stale-while-revalidate=120';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-stats' });
  if (rl.response) return rl.response;

  try {
    const gate = await sandboxGate(req);
    if (gate.response) return gate.response;

    const { verifiedAgents, genomesMinted, blocksVerified } = await cachedStats();

    return NextResponse.json(
      { verifiedAgents, genomesMinted, blocksVerified },
      { headers: { 'Cache-Control': PUBLIC_CACHE, ...gate.headers } }
    );
  } catch {
    return NextResponse.json(
      { verifiedAgents: 0, genomesMinted: 0, blocksVerified: 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
