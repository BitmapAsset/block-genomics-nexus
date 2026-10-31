// Serverless-safe challenge/nonce store backed by Postgres (Prisma).
//
// The previous implementation used a module-level in-memory Map. On Vercel each
// API route is a separate serverless function with isolated memory, so a nonce
// written by /api/v1/challenge was invisible to /api/v1/auth/verify — every real
// verify failed. Persisting nonces in Postgres makes them visible across lambdas
// and gives us an ATOMIC, replay-safe consume.

import prisma from '@/lib/prisma';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Every purpose a route consumes, with the plain words the wallet prompt shows.
 * POST /api/v1/challenge issues nonces for these purposes only.
 */
export const CHALLENGE_PURPOSES = {
  auth: 'sign in with this wallet',
  session: 'start a verified session for this wallet',
  world: 'change the world on a block you own',
  profile: 'create or change your profile',
  activity: 'record activity for this wallet',
  encryption: 'register your message encryption key',
  brain: 'act on block brain content',
  'parcel-customize': 'customize a parcel you own',
  'agent-register': 'register an agent for this wallet',
  'agent-manage': 'change or remove one of your agents',
  'agent-token': 'issue a new API key for one of your agents',
  'experience-register': 'register an experience on a block you own',
  'experience-manage': 'change or remove one of your experiences',
  'guardian-heartbeat': 'send a heartbeat for your guardian',
  guardian: 'configure the guardian of a block you own',
  vps: 'link, unlink or check a server for a block you own',
  delegation: 'list, withdraw or buy a delegation',
  ownership: 'sync or prepare the transfer of a block you own',
  chat: 'send a chat message or reaction',
  game: 'use the game with this wallet',
} as const;

export type ChallengePurpose = keyof typeof CHALLENGE_PURPOSES;

export function isChallengePurpose(p: unknown): p is ChallengePurpose {
  return typeof p === 'string' && Object.prototype.hasOwnProperty.call(CHALLENGE_PURPOSES, p);
}

/**
 * The text the wallet signs for a challenge: the site and what it authorizes,
 * then one fact per line. Plain ASCII, no special formatting (Xverse mobile
 * rejects it). The nonce is found in it by value (`consumeChallengeFromMessage`).
 */
export function challengeText(purpose: ChallengePurpose, address: string, nonce: string, expiresAt: Date): string {
  return [
    `blockgenomics.io: ${CHALLENGE_PURPOSES[purpose]}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join('\n');
}

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
 * Every issuer mints a nonce as 32 random bytes in lowercase hex and embeds it in
 * the message it hands out as a standalone token (not inside a longer hex run).
 */
const NONCE_TOKEN = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g;

/** A real message carries one nonce; a little headroom covers a signed body hash beside it. */
const MAX_NONCE_CANDIDATES = 4;

/**
 * Atomically consume the challenge whose nonce is embedded in a signed message.
 *
 * The nonce is looked up BY VALUE: each 64-hex token in the message is tried
 * against the atomic, address- and purpose-bound consume above. This used to
 * scan the address's 20 newest outstanding challenges and pick one the message
 * contained, so anyone who requested 20 challenges for a wallet pushed its real
 * nonce out of that window and locked it out of every signed flow (bg48 Q-10).
 * By value, how many rows are outstanding no longer matters.
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
  const candidates = [...new Set(message.match(NONCE_TOKEN) ?? [])].slice(0, MAX_NONCE_CANDIDATES);
  for (const nonce of candidates) {
    if (await consumeChallenge(nonce, { address, ...(opts.purpose ? { purpose: opts.purpose } : {}) })) return true;
  }
  return false;
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
