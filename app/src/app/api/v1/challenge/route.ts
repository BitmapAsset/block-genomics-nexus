import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { setChallenge, cleanupChallenges } from '@/lib/challenges';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  try {
    cleanupChallenges();
    const { walletAddress } = await req.json();
    if (!walletAddress) return error('walletAddress required', 400);

    const nonce = crypto.randomBytes(32).toString('hex');
    // Keep message simple — Xverse mobile rejects messages with special formatting
    const message = `Block Genomics verification: ${nonce}`;

    setChallenge(walletAddress, nonce);

    logActivity(walletAddress, 'challenge_request', {});

    return success({ message, nonce });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
