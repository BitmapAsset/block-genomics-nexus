import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { issueChallenge, cleanupChallenges, challengeText, isChallengePurpose, CHALLENGE_PURPOSES } from '@/lib/challenges';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';
import { rateLimitDurable, clientIpFrom, cleanupRateLimits } from '@/lib/rate-limit-db';

// Durable, cross-instance limit on challenge issuance (the unauthenticated auth
// entry point). Keyed by client IP; fail-open so a limiter outage can't block auth.
const CHALLENGE_RL_LIMIT = 30;
const CHALLENGE_RL_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    const rl = await rateLimitDurable(`challenge:${ip}`, CHALLENGE_RL_LIMIT, CHALLENGE_RL_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded — slow down and retry shortly' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    await cleanupChallenges();
    void cleanupRateLimits(); // best-effort; drop rate-limit rows whose window expired
    const { walletAddress, purpose: rawPurpose } = await req.json();
    if (!walletAddress || typeof walletAddress !== 'string') return error('walletAddress required', 400);
    const purpose = rawPurpose ?? 'auth';
    if (!isChallengePurpose(purpose)) {
      return error(`Unknown purpose. One of: ${Object.keys(CHALLENGE_PURPOSES).join(', ')}`, 400);
    }

    const nonce = crypto.randomBytes(32).toString('hex');

    // Persist to Postgres so the nonce is visible to the verify lambda (anti-replay).
    const { expiresAt } = await issueChallenge(nonce, { address: walletAddress, purpose });
    // Plain lines, no special formatting (Xverse mobile rejects it): the wallet
    // prompt names the site and what this signature authorizes.
    const message = challengeText(purpose, walletAddress, nonce, expiresAt);

    logActivity(walletAddress, 'challenge_request', {});

    return success({ message, nonce, purpose, expiresAt: expiresAt.toISOString() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
