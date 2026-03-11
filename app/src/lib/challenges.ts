// In-memory challenge store (replace with Redis in production)
const challenges = new Map<string, { nonce: string; createdAt: number }>();

// Clean up expired challenges (called from challenge route)
export function cleanupChallenges() {
  const now = Date.now();
  for (const [key, val] of challenges) {
    if (now - val.createdAt > 5 * 60 * 1000) challenges.delete(key);
  }
}

export function setChallenge(walletAddress: string, nonce: string) {
  challenges.set(walletAddress, { nonce, createdAt: Date.now() });
}

export function getChallenge(walletAddress: string) {
  return challenges.get(walletAddress);
}

export function deleteChallenge(walletAddress: string) {
  challenges.delete(walletAddress);
}
