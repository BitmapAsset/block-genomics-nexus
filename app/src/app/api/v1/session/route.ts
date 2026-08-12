/**
 * GET    /api/v1/session — what this credential can do ("my blocks")
 * DELETE /api/v1/session — revoke it
 *
 * The GET is how an agent discovers its own capability surface without guessing:
 * which wallet it is, which blocks it proved, when the credential dies. It
 * reports the SCOPE recorded at verification time and does not re-check the
 * chain — that check belongs at action time, and doing it here would let any
 * token holder drive unbounded indexer traffic. `note` says so explicitly so a
 * caller never reads this as a live ownership guarantee.
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { sessionTokenFromHeaders, gateDenialResponse } from '@/lib/ownership-gate';
import { authenticateSession, revokeSession, touchSession } from '@/lib/verified-sessions';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-session' });
  if (rl.response) return rl.response;

  try {
    const token = sessionTokenFromHeaders(req.headers);
    const auth = await authenticateSession(token);
    if (!auth.ok || !auth.session) {
      return gateDenialResponse({
        ok: false,
        status: auth.status,
        code: auth.status === 503 ? 'onchain_unavailable' : 'unverified',
        reason: auth.reason,
      });
    }

    void touchSession(auth.session.id);

    return success(
      {
        walletAddress: auth.session.walletAddress,
        verifiedBlocks: auth.session.verifiedBlocks,
        tokenPrefix: auth.session.tokenPrefix,
        createdAt: auth.session.createdAt.toISOString(),
        expiresAt: auth.session.expiresAt.toISOString(),
        canWrite: auth.session.verifiedBlocks.length > 0,
        note:
          'verifiedBlocks is the scope proven at verification time, not a live ownership claim. ' +
          'Every write re-checks the chain, so a transferred bitmap stops working immediately.',
      },
      200,
      NO_STORE
    );
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = sessionTokenFromHeaders(req.headers);
    if (!token) return error('Session token required', 401);

    // Idempotent: an already-revoked or unknown token reports revoked:false
    // rather than leaking whether the token ever existed.
    const revoked = await revokeSession(token);
    return NextResponse.json({ success: true, data: { revoked } }, { status: 200, headers: NO_STORE });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
