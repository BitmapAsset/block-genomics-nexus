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

    // The CDN replays this answer to every caller for 30 s, so it carries only
    // the policy (the limit is the same for everyone), never this caller's
    // remaining count. A sandbox key's private answer keeps its own quota
    // headers (gate.headers, spread last).
    return NextResponse.json(
      { verifiedAgents, genomesMinted, blocksVerified },
      {
        headers: {
          'Cache-Control': PUBLIC_CACHE,
          'X-RateLimit-Limit': rl.headers['X-RateLimit-Limit'],
          ...gate.headers,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { verifiedAgents: 0, genomesMinted: 0, blocksVerified: 0 },
      { headers: { ...rl.headers, 'Cache-Control': 'no-store' } }
    );
  }
}
