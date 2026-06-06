// Serverless-safe challenge/nonce store backed by Postgres (Prisma).
//
// The previous implementation used a module-level in-memory Map. On Vercel each
// API route is a separate serverless function with isolated memory, so a nonce
// written by /api/v1/challenge was invisible to /api/v1/auth/verify — every real
// verify failed. Persisting nonces in Postgres makes them visible across lambdas
// and gives us an ATOMIC, replay-safe consume.

import prisma from '@/lib/prisma';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface IssuedChallenge {
  nonce: string;
  expiresAt: Date;
}

/**
 * Persist a freshly minted challenge nonce.
 * @param nonce   The random nonce (the value embedded in the message the wallet signs).
 * @param opts    Optional address/purpose binding and TTL override.
 */
export async function issueChallenge(
  nonce: string,
  opts: { address?: string; purpose?: string; ttlMs?: number } = {}
): Promise<IssuedChallenge> {
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS));
  await prisma.challenge.create({
    data: {
      challenge: nonce,
      address: opts.address ?? null,
      purpose: opts.purpose ?? null,
      expiresAt,
    },
  });
  return { nonce, expiresAt };
}

/**
 * Atomically consume a challenge by its exact nonce.
 *
 * Race/replay safety: the update targets a unique `challenge` row guarded by
 * `consumedAt IS NULL AND expiresAt > now`. Under Postgres READ COMMITTED, two
 * concurrent consumes of the same nonce serialize on the row lock; the second
 * re-evaluates the predicate against the now-consumed row and matches 0 rows.
 * Exactly one caller can ever see `count === 1`.
 *
 * @returns true if the nonce was valid, unexpired, unconsumed, and is now consumed.
 */
export async function consumeChallenge(
  nonce: string,
  opts: { address?: string; purpose?: string } = {}
): Promise<boolean> {
  if (!nonce) return false;
  const now = new Date();
  const res = await prisma.challenge.updateMany({
    where: {
      challenge: nonce,
      consumedAt: null,
      expiresAt: { gt: now },
      ...(opts.address ? { address: opts.address } : {}),
      ...(opts.purpose ? { purpose: opts.purpose } : {}),
    },
    data: { consumedAt: now },
  });
  return res.count === 1;
}

/**
 * Atomically consume the challenge whose nonce is embedded in a signed message.
 *
 * Mirrors the legacy semantics (the signed message must contain the issued
 * nonce) while remaining replay-safe: candidate nonces for the address are
 * looked up, the one present in the message is selected, then consumed via the
 * atomic per-row update above.
 *
 * @param address The wallet address the challenge was issued to.
 * @param message The full message the wallet signed (must contain the nonce).
 * @param opts    Optional purpose binding.
 */
export async function consumeChallengeFromMessage(
  address: string,
  message: string,
  opts: { purpose?: string } = {}
): Promise<boolean> {
  if (!address || !message) return false;
  const now = new Date();
  const candidates = await prisma.challenge.findMany({
    where: {
      address,
      consumedAt: null,
      expiresAt: { gt: now },
      ...(opts.purpose ? { purpose: opts.purpose } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const match = candidates.find((c) => message.includes(c.challenge));
  if (!match) return false;
  return consumeChallenge(match.challenge, {});
}

/**
 * Delete expired challenges and consumed challenges older than the TTL window.
 * Best-effort housekeeping; safe to call opportunistically on the issue path.
 */
export async function cleanupChallenges(): Promise<void> {
  const cutoff = new Date(Date.now() - DEFAULT_TTL_MS);
  await prisma.challenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { lt: cutoff } },
      ],
    },
  });
}
