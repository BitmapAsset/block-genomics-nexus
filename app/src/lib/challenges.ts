// WARNING: In-memory challenge store — NOT safe for multi-instance/serverless deployments.
// An attacker can request a challenge on instance A and verify on instance B where no
// challenge exists, bypassing anti-replay protection. Replace with Redis or database-backed
// store before production deployment (e.g. @upstash/redis).

interface StoredChallenge {
  nonce: string;
  createdAt: number;
}

const challenges = new Map<string, StoredChallenge>();

/** Clean up expired challenges (older than 5 minutes) */
export function cleanupChallenges(): void {
  const now = Date.now();
  for (const [key, val] of challenges) {
    if (now - val.createdAt > 5 * 60 * 1000) challenges.delete(key);
  }
}

/** Store a challenge nonce for a wallet address. Overwrites any existing challenge. */
export function setChallenge(walletAddress: string, nonce: string): void {
  challenges.set(walletAddress, { nonce, createdAt: Date.now() });
}

/** Retrieve the stored challenge for a wallet address (undefined if expired or absent). */
export function getChallenge(walletAddress: string): StoredChallenge | undefined {
  return challenges.get(walletAddress);
}

/** Delete a challenge after successful verification (anti-replay). */
export function deleteChallenge(walletAddress: string): void {
  challenges.delete(walletAddress);
}
