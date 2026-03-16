// In-memory challenge store (replace with Redis in production)

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

export function setChallenge(walletAddress: string, nonce: string): void {
  challenges.set(walletAddress, { nonce, createdAt: Date.now() });
}

export function getChallenge(walletAddress: string): StoredChallenge | undefined {
  return challenges.get(walletAddress);
}

export function deleteChallenge(walletAddress: string): void {
  challenges.delete(walletAddress);
}
