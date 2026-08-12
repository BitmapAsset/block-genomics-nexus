/**
 * Verified sessions — the scoped credential an agent receives after proving
 * Bitcoin-native identity and bitmap ownership.
 *
 * This is the credential half of the founder rule: *an open connection is not an
 * open capability*. Anyone may connect to the MCP endpoint and read. To WRITE,
 * a caller must first:
 *   1. take a challenge nonce from the existing `/api/v1/challenge` store,
 *   2. sign it (BIP-322) with the wallet holding their `<height>.bitmap`
 *      inscription,
 *   3. pass an on-chain check that the wallet holds that inscription NOW.
 * Only then is a `bg_vfy_` token minted, scoped to that wallet and the blocks it
 * proved.
 *
 * Storage mirrors `agent-tokens.ts` / `sandbox-keys.ts`: only the SHA-256 hash is
 * persisted and compared in constant time. A slow hash (bcrypt/argon2) defends
 * low-entropy human passwords; against a 2^256 random space it buys nothing and
 * would tax every gated write.
 *
 * `verifiedBlocks` is a CEILING, not a grant. It records what the wallet proved
 * at verification time so a token can never be used for a block it never proved.
 * Because bitmaps transfer, the scope alone is never trusted at action time —
 * `lib/ownership-gate.ts` re-checks the chain before any write lands. Scope
 * narrows what is possible; the live chain check decides what is allowed.
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { bearerFrom } from '@/lib/sandbox-tier';

/** Plaintext token prefix. Distinct from `bg_agent_` / `bg_sbx_` so the tier is obvious on sight. */
export const VERIFIED_TOKEN_PREFIX = 'bg_vfy_';

/**
 * Challenge `purpose` that binds a nonce to the session-minting flow.
 *
 * Shares the existing `Challenge` table with every other signed action; the
 * purpose is what stops a nonce signed for a world write from being redeemed
 * for a credential.
 */
export const SESSION_CHALLENGE_PURPOSE = 'session';

/**
 * Token lifetime. Short enough that a leaked token's blast radius expires on its
 * own, long enough that an agent is not re-signing mid-task. Re-verification is
 * cheap (one signature), so this favours the security side.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Most blocks a single verification call may claim, bounding on-chain work. */
export const MAX_BLOCKS_PER_SESSION = 25;

/** Mint a fresh plaintext session token (shown to the caller exactly once). */
export function generateSessionToken(): string {
  return VERIFIED_TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash (hex) of a token, for at-rest storage and lookup. */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Displayable, non-secret fragment (`bg_vfy_1a2b3c4d`) so sessions are distinguishable in logs. */
export function sessionTokenPrefix(token: string): string {
  return token.slice(0, VERIFIED_TOKEN_PREFIX.length + 8);
}

/** Shape-only check — says nothing about whether the token is valid or live. */
export function looksLikeSessionToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(VERIFIED_TOKEN_PREFIX);
}

/**
 * Read a session token off a request: `Authorization: Bearer <token>` or the
 * `X-BG-Session` header, for clients that already spend `Authorization` on
 * something else.
 */
export function sessionTokenFromHeaders(headers: { get(name: string): string | null }): string | null {
  const bearer = bearerFrom(headers.get('authorization'));
  if (bearer) return bearer;
  const header = headers.get('x-bg-session')?.trim();
  return header && header.length > 0 ? header : null;
}

/** Constant-time compare of two SHA-256 hex digests. */
function timingSafeEqualHex(a: string, b: string): boolean {
  let ba: Buffer;
  let bb: Buffer;
  try {
    ba = Buffer.from(a, 'hex');
    bb = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export interface VerifiedSessionRecord {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  walletAddress: string;
  verifiedBlocks: number[];
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export type SessionAuthFailure =
  | 'missing_token'
  | 'invalid_token'
  | 'revoked_token'
  | 'expired_token';

export interface SessionAuthResult {
  ok: boolean;
  status: number;
  reason?: string;
  code?: SessionAuthFailure;
  session?: VerifiedSessionRecord;
}

const SELECT = {
  id: true,
  tokenHash: true,
  tokenPrefix: true,
  walletAddress: true,
  verifiedBlocks: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export type SessionLookup = (tokenHash: string) => Promise<VerifiedSessionRecord | null>;

async function defaultLookup(tokenHash: string): Promise<VerifiedSessionRecord | null> {
  return prisma.verifiedSession.findUnique({ where: { tokenHash }, select: SELECT });
}

/**
 * Persist a freshly minted session for a wallet and the blocks it just proved.
 *
 * @param walletAddress  The BIP-322 signer.
 * @param verifiedBlocks Block heights whose ownership was confirmed on-chain in this flow.
 * @returns The plaintext token (returned to the caller once) plus the stored record.
 */
export async function mintVerifiedSession(
  walletAddress: string,
  verifiedBlocks: number[],
  opts: { label?: string; ttlMs?: number; now?: number } = {}
): Promise<{ token: string; session: VerifiedSessionRecord }> {
  const token = generateSessionToken();
  const now = opts.now ?? Date.now();
  // Deduplicate and sort so scope checks and API output are stable.
  const blocks = [...new Set(verifiedBlocks)].sort((a, b) => a - b);

  const session = await prisma.verifiedSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      tokenPrefix: sessionTokenPrefix(token),
      walletAddress,
      verifiedBlocks: blocks,
      label: opts.label ?? null,
      expiresAt: new Date(now + (opts.ttlMs ?? SESSION_TTL_MS)),
    },
    select: SELECT,
  });

  return { token, session };
}

/**
 * Authenticate a `bg_vfy_` token.
 *
 * FAILS CLOSED on a lookup error — unlike metering, identity must never be
 * admitted because the database hiccuped.
 *
 * @param opts.lookup Override the DB lookup (tests).
 * @param opts.now    Override the clock (tests).
 */
export async function authenticateSession(
  plaintextToken: string | null | undefined,
  opts: { now?: number; lookup?: SessionLookup } = {}
): Promise<SessionAuthResult> {
  if (!looksLikeSessionToken(plaintextToken)) {
    return {
      ok: false,
      status: 401,
      code: 'missing_token',
      reason:
        'This action requires a verified session. Prove bitmap ownership first: ' +
        'POST /api/v1/session/start, sign the message with the wallet holding your ' +
        '.bitmap inscription, then POST /api/v1/session/verify.',
    };
  }

  const tokenHash = hashSessionToken(plaintextToken as string);
  const lookup = opts.lookup ?? defaultLookup;

  let record: VerifiedSessionRecord | null;
  try {
    record = await lookup(tokenHash);
  } catch (e: unknown) {
    console.warn('[verified-sessions] lookup failed:', e instanceof Error ? e.message : String(e));
    return { ok: false, status: 503, reason: 'Session verification temporarily unavailable' };
  }

  if (!record || !timingSafeEqualHex(record.tokenHash, tokenHash)) {
    return { ok: false, status: 401, code: 'invalid_token', reason: 'Invalid session token' };
  }

  if (record.revokedAt) {
    return { ok: false, status: 401, code: 'revoked_token', reason: 'Session revoked — verify again to continue' };
  }

  const now = opts.now ?? Date.now();
  if (record.expiresAt.getTime() <= now) {
    return {
      ok: false,
      status: 401,
      code: 'expired_token',
      reason: 'Session expired — re-verify bitmap ownership via POST /api/v1/session/start',
    };
  }

  return { ok: true, status: 200, session: record };
}

/**
 * Is `blockHeight` inside the scope this session proved?
 *
 * NECESSARY, NOT SUFFICIENT — the caller must still re-check the chain before
 * acting. See `lib/ownership-gate.ts`.
 */
export function sessionCoversBlock(session: VerifiedSessionRecord, blockHeight: number): boolean {
  return Number.isInteger(blockHeight) && session.verifiedBlocks.includes(blockHeight);
}

/** Revoke a session by its token. Idempotent; returns true when a live session was revoked. */
export async function revokeSession(plaintextToken: string): Promise<boolean> {
  if (!looksLikeSessionToken(plaintextToken)) return false;
  const res = await prisma.verifiedSession.updateMany({
    where: { tokenHash: hashSessionToken(plaintextToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count === 1;
}

/** Best-effort usage stamp. Never allowed to fail a request. */
export async function touchSession(id: string): Promise<void> {
  try {
    await prisma.verifiedSession.update({
      where: { id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    });
  } catch {
    /* best-effort */
  }
}

/** Delete sessions whose expiry has passed. Best-effort housekeeping. */
export async function cleanupSessions(): Promise<void> {
  try {
    await prisma.verifiedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* best-effort */
  }
}
