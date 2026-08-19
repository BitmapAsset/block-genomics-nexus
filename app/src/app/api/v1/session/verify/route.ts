/**
 * POST /api/v1/session/verify — step 2 of the ownership handshake.
 *
 * Turns a signature into a capability. Order is deliberate and every step fails
 * closed:
 *
 *   1. BIP-322 signature over the exact message  → proves wallet control
 *   2. atomic consume of the challenge nonce     → proves freshness (anti-replay)
 *   3. live on-chain check per claimed block     → proves bitmap ownership
 *   4. mint `bg_vfy_` token scoped to what passed
 *
 * Step 1 alone is not ownership — a wallet can sign without holding any bitmap,
 * which is exactly why step 3 exists. A caller claiming several blocks gets a
 * token scoped to the subset that verified; blocks that fail are reported back
 * rather than silently dropped. If NO claimed block verifies, no token is issued.
 *
 * `blocks: []` is allowed and mints a read-scoped session: an identity with no
 * write capability. That is the honest representation of "connected, verified
 * wallet, owns nothing here" — the gate will refuse every block.
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { verifyBip322 } from '@/lib/bip322';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import {
  mintVerifiedSession,
  MAX_BLOCKS_PER_SESSION,
  SESSION_CHALLENGE_PURPOSE,
} from '@/lib/verified-sessions';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RL_LIMIT = 20;
const RL_WINDOW_MS = 60_000;

/** Parse the caller-supplied block list into clean, bounded, de-duplicated heights. */
function parseBlocks(raw: unknown): { blocks: number[]; bad: boolean } {
  if (raw === undefined || raw === null) return { blocks: [], bad: false };
  if (!Array.isArray(raw)) return { blocks: [], bad: true };
  const blocks: number[] = [];
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number.parseInt(String(item), 10);
    if (!Number.isInteger(n) || n < 0) return { blocks: [], bad: true };
    blocks.push(n);
  }
  return { blocks: [...new Set(blocks)], bad: false };
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    const rl = await rateLimitDurable(`session-verify:${ip}`, RL_LIMIT, RL_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded — slow down and retry shortly' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'Cache-Control': 'no-store' } }
      );
    }

    const body = await req.json().catch(() => null);
    const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';
    const message = typeof body?.message === 'string' ? body.message : '';
    const signature = typeof body?.signature === 'string' ? body.signature : '';
    const inscriptionIds: Record<string, string> =
      body?.inscriptionIds && typeof body.inscriptionIds === 'object' && !Array.isArray(body.inscriptionIds)
        ? body.inscriptionIds
        : {};

    if (!walletAddress || !message || !signature) {
      return error('walletAddress, message and signature are required', 400);
    }
    if (!isValidBitcoinAddress(walletAddress)) return error('Invalid Bitcoin address', 400);

    const { blocks, bad } = parseBlocks(body?.blocks);
    if (bad) return error('blocks must be an array of non-negative integer block heights', 400);
    if (blocks.length > MAX_BLOCKS_PER_SESSION) {
      return error(`Claim at most ${MAX_BLOCKS_PER_SESSION} blocks per session`, 400);
    }

    // ── 1. Signature proves wallet control ────────────────────────
    if (!verifyBip322(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // ── 2. Nonce proves freshness (atomic, single-use) ────────────
    const consumed = await consumeChallengeFromMessage(walletAddress, message, {
      purpose: SESSION_CHALLENGE_PURPOSE,
    });
    if (!consumed) {
      return error(
        'No valid challenge found. Request one from POST /api/v1/session/start and sign it within 5 minutes.',
        401
      );
    }

    // ── 3. On-chain check proves bitmap ownership, per block ──────
    const verifiedBlocks: number[] = [];
    const rejected: Array<{ blockHeight: number; reason: string; retryable: boolean }> = [];

    for (const blockHeight of blocks) {
      const known = inscriptionIds[String(blockHeight)];
      const check = await verifyBlockOwnedBy(
        walletAddress,
        blockHeight,
        typeof known === 'string' && known.length > 0 ? known : null
      );
      if (check.verified) {
        verifiedBlocks.push(blockHeight);
      } else {
        rejected.push({
          blockHeight,
          reason: check.unavailable
            ? 'On-chain ownership could not be confirmed right now — retry shortly.'
            : check.reason ?? 'Ownership check failed',
          retryable: Boolean(check.unavailable),
        });
      }
    }

    // Asking for blocks and getting none is a failed verification, not a
    // silently-downgraded read session — say so instead of handing back a token
    // that cannot do what the caller asked for.
    if (blocks.length > 0 && verifiedBlocks.length === 0) {
      const anyRetryable = rejected.some((r) => r.retryable);
      return NextResponse.json(
        {
          success: false,
          error: 'No claimed block could be verified as owned by this wallet',
          code: anyRetryable ? 'onchain_unavailable' : 'ownership_not_proven',
          rejected,
        },
        {
          status: anyRetryable ? 503 : 403,
          headers: { 'Cache-Control': 'no-store', ...(anyRetryable ? { 'Retry-After': '15' } : {}) },
        }
      );
    }

    // ── 4. Mint the scoped credential ─────────────────────────────
    const { token, session } = await mintVerifiedSession(walletAddress, verifiedBlocks, {
      label: typeof body?.label === 'string' ? body.label.slice(0, 80) : undefined,
    });

    logActivity(walletAddress, 'session_verified', {
      blocks: verifiedBlocks.length,
      rejected: rejected.length,
    });

    return success(
      {
        // Shown exactly once — never retrievable again.
        token,
        tokenPrefix: session.tokenPrefix,
        walletAddress: session.walletAddress,
        verifiedBlocks: session.verifiedBlocks,
        rejected,
        expiresAt: session.expiresAt.toISOString(),
        usage: 'Send as `Authorization: Bearer <token>` on write calls and on the MCP endpoint.',
        note:
          'Ownership is re-checked on-chain at action time. If a bitmap transfers, ' +
          'writes against it stop working immediately even while this token is still valid.',
      },
      201,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
