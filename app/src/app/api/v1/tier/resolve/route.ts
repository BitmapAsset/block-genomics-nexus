import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { resolveTier } from '@/lib/tier-resolver';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { authenticateSession, sessionTokenFromHeaders } from '@/lib/verified-sessions';

/** Each call can trigger a full wallet scan, so it sits at the amplification-guard end. */
const TIER_RESOLVE_LIMIT = 10;

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-tier-resolve', limit: TIER_RESOLVE_LIMIT });
  if (rl.response) return rl.response;

  try {
    const body = await req.json();
    const { walletAddress, force } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return error('walletAddress is required', 400);
    }

    if (walletAddress.length < 20 || walletAddress.length > 100) {
      return error('Invalid wallet address', 400);
    }

    // A wallet's tier is re-resolved only by that wallet. Unauthenticated, any
    // caller could force a rescan of any wallet (or wipe its tier on a failed
    // scan), and every browser connect made that call for whoever was connected.
    const auth = await authenticateSession(sessionTokenFromHeaders(req.headers));
    if (!auth.ok || !auth.session) {
      return error(auth.reason ?? 'A verified session is required to resolve a tier', auth.status);
    }
    if (auth.session.walletAddress !== walletAddress) {
      return error('A session can only resolve the tier of its own wallet', 403);
    }

    const resolution = await resolveTier(walletAddress, { force: !!force });

    return success(resolution);
  } catch (e: unknown) {
    console.error('[tier/resolve] Error:', e);
    return error('Failed to resolve tier', 500);
  }
}
