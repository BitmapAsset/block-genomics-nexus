import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { issueChallenge, cleanupChallenges } from '@/lib/challenges';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';

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
    const { walletAddress, purpose } = await req.json();
    if (!walletAddress) return error('walletAddress required', 400);

    const nonce = crypto.randomBytes(32).toString('hex');
    // Keep message simple — Xverse mobile rejects messages with special formatting
    const message = `Block Genomics verification: ${nonce}`;

    // Persist to Postgres so the nonce is visible to the verify lambda (anti-replay).
    await issueChallenge(nonce, { address: walletAddress, purpose: purpose || 'auth' });

    logActivity(walletAddress, 'challenge_request', {});

    return success({ message, nonce });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
