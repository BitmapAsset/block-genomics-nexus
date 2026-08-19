/**
 * The ownership gate — one choke point every write/build action passes through.
 *
 * Founder rule: an open connection is not an open capability. Read tools are
 * public; anything that writes or builds must prove, at the moment it acts, that
 * the caller holds the `.bitmap` inscription for the block it is touching.
 *
 * Three checks, in this order, all fail-closed:
 *
 *   1. IDENTITY  — a live, unexpired, unrevoked `bg_vfy_` session token, which
 *                  only exists because a BIP-322 signature over a one-time
 *                  challenge nonce was verified.
 *   2. SCOPE     — the target block is in the set this session actually proved.
 *                  Stops a wallet that verified block A from writing to block B.
 *   3. LIVE CHAIN— the wallet still holds that block's inscription RIGHT NOW.
 *
 * Step 3 is the one that is easy to skip and expensive to omit. Bitmaps are
 * transferable: a token minted at 09:00 describes ownership at 09:00, and the
 * inscription may have been sold by 09:05. A scope-only gate would keep honouring
 * it until expiry, letting a former owner write to a block someone else now owns.
 * So scope narrows what is POSSIBLE and the live chain check decides what is
 * ALLOWED — the DB `Block.ownerAddress` cache is deliberately not consulted,
 * because a stale cache is exactly the failure mode this exists to prevent.
 *
 * When no indexer can answer we return 503 (retryable), never a grant. A caller
 * cannot convert "the chain is unreachable" into a write.
 */

import { NextResponse } from 'next/server';
import {
  authenticateSession,
  sessionCoversBlock,
  sessionTokenFromHeaders,
  touchSession,
  type SessionLookup,
  type VerifiedSessionRecord,
} from '@/lib/verified-sessions';
import { verifyBlockOwnedBy, type OwnershipCheck } from '@/lib/onchain/bitmap-ownership';

export { sessionTokenFromHeaders };

export type GateDenial =
  | 'unverified'
  | 'out_of_scope'
  | 'ownership_lost'
  | 'onchain_unavailable'
  | 'bad_request';

export interface GateResult {
  ok: boolean;
  status: number;
  code?: GateDenial;
  reason?: string;
  session?: VerifiedSessionRecord;
  /** The wallet the action must be attributed to. Never taken from the request body. */
  walletAddress?: string;
}

/**
 * Guidance attached to every denial, so an agent can self-serve its way to a
 * credential instead of guessing.
 */
export const VERIFY_STEPS = [
  'POST /api/v1/session/start — get a challenge message for your wallet',
  'Sign that exact message with the wallet holding your <height>.bitmap inscription (BIP-322)',
  'POST /api/v1/session/verify — exchange the signature for a bg_vfy_ session token',
  'Send the token as `Authorization: Bearer <token>` on write calls',
] as const;

/**
 * Authorize a write against `blockHeight`.
 *
 * @param req         Anything exposing request headers.
 * @param blockHeight The block the action targets.
 * @param opts.inscriptionId  Known `.bitmap` inscription, skips the wallet scan.
 * @param opts.verifyOwnership Override the on-chain check (tests).
 * @param opts.now            Override the clock (tests).
 */
export async function requireVerifiedBlock(
  req: { headers: { get(name: string): string | null } },
  blockHeight: number,
  opts: {
    inscriptionId?: string | null;
    verifyOwnership?: (wallet: string, height: number, inscriptionId?: string | null) => Promise<OwnershipCheck>;
    now?: number;
    lookup?: SessionLookup;
  } = {}
): Promise<GateResult> {
  if (!Number.isInteger(blockHeight) || blockHeight < 0) {
    return { ok: false, status: 400, code: 'bad_request', reason: 'A valid integer blockHeight is required' };
  }

  // ── 1. IDENTITY ──────────────────────────────────────────────────
  const auth = await authenticateSession(sessionTokenFromHeaders(req.headers), {
    now: opts.now,
    ...(opts.lookup ? { lookup: opts.lookup } : {}),
  });
  if (!auth.ok || !auth.session) {
    return {
      ok: false,
      status: auth.status,
      code: auth.status === 503 ? 'onchain_unavailable' : 'unverified',
      reason: auth.reason,
    };
  }
  const session = auth.session;

  // ── 2. SCOPE ─────────────────────────────────────────────────────
  if (!sessionCoversBlock(session, blockHeight)) {
    return {
      ok: false,
      status: 403,
      code: 'out_of_scope',
      reason:
        `This session has not proven ownership of block ${blockHeight}. ` +
        `Verified blocks: ${session.verifiedBlocks.length ? session.verifiedBlocks.join(', ') : 'none'}.`,
      session,
    };
  }

  // ── 3. LIVE CHAIN RE-VERIFY ──────────────────────────────────────
  const verify = opts.verifyOwnership ?? verifyBlockOwnedBy;
  const onchain = await verify(session.walletAddress, blockHeight, opts.inscriptionId ?? null);

  if (onchain.unavailable) {
    return {
      ok: false,
      status: 503,
      code: 'onchain_unavailable',
      reason: 'On-chain ownership could not be confirmed right now. Retry shortly.',
      session,
    };
  }

  if (!onchain.verified) {
    return {
      ok: false,
      status: 403,
      code: 'ownership_lost',
      reason:
        `Block ${blockHeight} is no longer held by this wallet on-chain. ` +
        (onchain.reason ?? 'Ownership check failed.'),
      session,
    };
  }

  void touchSession(session.id);
  return { ok: true, status: 200, session, walletAddress: session.walletAddress };
}

/** Render a gate denial as the API's standard error envelope. */
export function gateDenialResponse(gate: GateResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: gate.reason ?? 'Not authorized for this block',
      code: gate.code,
      ...(gate.code === 'unverified' ? { verify: { steps: VERIFY_STEPS } } : {}),
    },
    {
      status: gate.status,
      headers: {
        'Cache-Control': 'no-store',
        ...(gate.status === 503 ? { 'Retry-After': '15' } : {}),
      },
    }
  );
}
