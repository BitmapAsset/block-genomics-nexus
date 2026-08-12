/**
 * POST /api/v1/session/start — step 1 of the ownership handshake.
 *
 * Issues the message an agent must sign to prove it holds a bitmap. This is a
 * thin, agent-friendly face over the SAME challenge store `/api/v1/challenge`
 * uses (one `Challenge` table, one nonce format, one atomic consume) — not a
 * second auth system. The only difference is `purpose: 'session'`, which binds a
 * nonce to the session-minting flow so a nonce signed for, say, a world write
 * cannot be redeemed for a credential.
 *
 * Public and unauthenticated by necessity — it is the entry point to auth — so
 * it carries a durable per-IP rate limit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { issueChallenge, cleanupChallenges } from '@/lib/challenges';
import { rateLimitDurable, clientIpFrom, cleanupRateLimits } from '@/lib/rate-limit-db';
import {
  cleanupSessions,
  SESSION_TTL_MS,
  MAX_BLOCKS_PER_SESSION,
  SESSION_CHALLENGE_PURPOSE,
} from '@/lib/verified-sessions';
import { VERIFY_STEPS } from '@/lib/ownership-gate';
import { logActivity } from '@/lib/activity';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const RL_LIMIT = 30;
const RL_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    const rl = await rateLimitDurable(`session-start:${ip}`, RL_LIMIT, RL_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded — slow down and retry shortly' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'Cache-Control': 'no-store' } }
      );
    }

    const body = await req.json().catch(() => null);
    const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';

    if (!walletAddress) return error('walletAddress required', 400);
    if (!isValidBitcoinAddress(walletAddress)) return error('Invalid Bitcoin address', 400);

    // Opportunistic housekeeping on the cheap, frequently-hit entry point.
    void cleanupChallenges();
    void cleanupRateLimits();
    void cleanupSessions();

    const nonce = crypto.randomBytes(32).toString('hex');
    // Keep the message plain — Xverse mobile rejects special formatting.
    const message = `Block Genomics verification: ${nonce}`;

    const { expiresAt } = await issueChallenge(nonce, {
      address: walletAddress,
      purpose: SESSION_CHALLENGE_PURPOSE,
    });

    logActivity(walletAddress, 'session_challenge', {});

    return success(
      {
        message,
        nonce,
        expiresAt: expiresAt.toISOString(),
        walletAddress,
        next: {
          sign: 'Sign the `message` value verbatim with the wallet holding your <height>.bitmap inscription (BIP-322).',
          then: 'POST /api/v1/session/verify with { walletAddress, message, signature, blocks: [<height>, ...] }',
          steps: VERIFY_STEPS,
          maxBlocks: MAX_BLOCKS_PER_SESSION,
          sessionTtlSeconds: Math.floor(SESSION_TTL_MS / 1000),
        },
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
