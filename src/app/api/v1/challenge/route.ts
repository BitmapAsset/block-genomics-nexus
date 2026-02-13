import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { setChallenge, cleanupChallenges } from '@/lib/challenges';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    cleanupChallenges();
    const { walletAddress } = await req.json();
    if (!walletAddress) return error('walletAddress required', 400);

    const nonce = crypto.randomBytes(32).toString('hex');
    const message = `Block Genomics Verification\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

    setChallenge(walletAddress, nonce);

    return success({ message, nonce });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
