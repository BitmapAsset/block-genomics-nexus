/**
 * Sandbox API keys — the read-only trial tier.
 *
 * A sandbox key is a 256-bit random secret handed out with NO ownership proof, so
 * a developer can exercise the API before they own a Bitmap block. It buys a
 * metered, authenticated identity on read endpoints; every write stays behind the
 * BIP-322 ownership flow (enforced in middleware, see `sandbox-tier.ts`).
 *
 * Storage mirrors `agent-tokens.ts`: only the SHA-256 hash is persisted and
 * compared in constant time. A slow hash (bcrypt/argon2) buys nothing against a
 * 2^256 random space and would tax the hot path.
 *
 * The daily quota is enforced by the durable Postgres limiter (`rate-limit-db.ts`)
 * so it holds across lambda instances. That limiter is FAIL-OPEN by design: if the
 * limiter table is unreachable we admit the request rather than take the API down.
 * Sandbox keys grant read-only access to already-public data, so failing open on a
 * metering outage costs quota accuracy, never confidentiality.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rateLimitDurable, type RateCounter, type RateLimitResult } from '@/lib/rate-limit-db';
import {
  SANDBOX_KEY_PREFIX,
  SANDBOX_DAILY_LIMIT,
  SANDBOX_ISSUE_PER_IP_PER_DAY,
  DAY_MS,
  sandboxKeyFromHeaders,
} from '@/lib/sandbox-tier';

/** Mint a fresh plaintext sandbox key (shown to the caller exactly once). */
export function generateSandboxKey(): string {
  return SANDBOX_KEY_PREFIX + crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash (hex) of a key, for at-rest storage and lookup. */
export function hashSandboxKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Displayable, non-secret fragment of a key (`bg_sbx_1a2b3c4d`) so a developer can
 * tell two keys apart in logs without us storing the secret.
 */
export function sandboxKeyPrefix(key: string): string {
  return key.slice(0, SANDBOX_KEY_PREFIX.length + 8);
}

/**
 * Salted hash of a client IP, used only to cap issuance per source.
 *
 * This is obfuscation-at-rest, not anonymization — a 32-bit IPv4 space is
 * brute-forceable if both the salt and the table leak. The actual protection is
 * that `SandboxKey` has RLS enabled+forced with no public-read policy. Set
 * `SANDBOX_IP_SALT` in the environment to make the hashes unguessable.
 */
export function hashIp(ip: string): string {
  const salt = process.env.SANDBOX_IP_SALT || 'bg-sandbox-ip-v1';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
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

export interface SandboxKeyRecord {
  id: string;
  keyHash: string;
  keyPrefix: string;
  label: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type SandboxAuthFailure = 'invalid_key' | 'revoked_key' | 'quota_exceeded';

export interface SandboxAuthResult {
  ok: boolean;
  status: number;
  reason?: string;
  code?: SandboxAuthFailure;
  key?: SandboxKeyRecord;
  quota?: RateLimitResult;
}

/** Limiter key for a sandbox key's daily quota. */
export function quotaKeyFor(keyHash: string): string {
  return `sbx:${keyHash}`;
}

/** Limiter key for per-IP issuance capping. */
export function issueKeyFor(ipHash: string): string {
  return `sbx-issue:${ipHash}`;
}

/**
 * Check whether `ipHash` may mint another sandbox key today.
 * Fail-open (inherited from the durable limiter) — abuse control, not an auth gate.
 */
export function checkIssuanceAllowance(
  ipHash: string,
  opts: { now?: number; counter?: RateCounter } = {}
): Promise<RateLimitResult> {
  return rateLimitDurable(issueKeyFor(ipHash), SANDBOX_ISSUE_PER_IP_PER_DAY, DAY_MS, opts);
}

/**
 * Authenticate a sandbox key and record one request against its daily quota.
 *
 * Order matters: the key must resolve and be live BEFORE the quota is charged, so
 * a garbage key can never burn a real key's allowance.
 *
 * @param plaintextKey The `bg_sbx_...` credential from the request.
 * @param opts.lookup  Override the DB lookup (tests).
 * @param opts.counter Override the atomic counter seam (tests).
 */
export async function authenticateSandboxKey(
  plaintextKey: string,
  opts: {
    now?: number;
    counter?: RateCounter;
    lookup?: (keyHash: string) => Promise<SandboxKeyRecord | null>;
  } = {}
): Promise<SandboxAuthResult> {
  const keyHash = hashSandboxKey(plaintextKey);
  const lookup = opts.lookup ?? defaultLookup;

  let record: SandboxKeyRecord | null;
  try {
    record = await lookup(keyHash);
  } catch (e: unknown) {
    // FAIL-CLOSED on the identity lookup — unlike metering, we must never admit an
    // unverified key just because the database hiccuped.
    console.warn('[sandbox-keys] lookup failed:', e instanceof Error ? e.message : String(e));
    return { ok: false, status: 503, reason: 'Sandbox key verification temporarily unavailable' };
  }

  if (!record || !timingSafeEqualHex(record.keyHash, keyHash)) {
    return { ok: false, status: 401, code: 'invalid_key', reason: 'Invalid sandbox key' };
  }

  if (record.revokedAt) {
    return {
      ok: false,
      status: 401,
      code: 'revoked_key',
      reason: 'Sandbox key revoked — issue a new one at POST /api/v1/sandbox/key',
    };
  }

  const quota = await rateLimitDurable(quotaKeyFor(keyHash), SANDBOX_DAILY_LIMIT, DAY_MS, opts);

  if (!quota.allowed) {
    return {
      ok: false,
      status: 429,
      code: 'quota_exceeded',
      reason: `Sandbox quota exhausted — ${SANDBOX_DAILY_LIMIT} requests per UTC day. Resets in ${quota.retryAfterSec}s.`,
      key: record,
      quota,
    };
  }

  return { ok: true, status: 200, key: record, quota };
}

async function defaultLookup(keyHash: string): Promise<SandboxKeyRecord | null> {
  return prisma.sandboxKey.findUnique({
    where: { keyHash },
    select: { id: true, keyHash: true, keyPrefix: true, label: true, revokedAt: true, createdAt: true },
  });
}

/** Best-effort usage stamp. Never allowed to fail a request. */
export async function touchSandboxKey(id: string): Promise<void> {
  try {
    await prisma.sandboxKey.update({
      where: { id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    });
  } catch {
    /* best-effort */
  }
}

/** Standard rate-limit headers for a sandbox response. */
export function sandboxRateHeaders(quota: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(quota.limit),
    'X-RateLimit-Remaining': String(Math.max(0, quota.limit - quota.count)),
    'X-RateLimit-Reset': String(Math.floor(quota.resetAt / 1000)),
    'X-BG-Tier': 'sandbox',
  };
}

export interface SandboxGate {
  /** Non-null when the request must be short-circuited (bad key / quota spent). */
  response: NextResponse | null;
  /** Headers to merge into the route's response. */
  headers: Record<string, string>;
  /** True when a valid sandbox key was presented and charged. */
  authenticated: boolean;
}

/**
 * Metered reads are per-caller, but these routes sit behind a shared CDN. Without
 * this, the edge cache serves one caller's response — quota headers and all — to
 * everyone else, and a cache HIT skips the route entirely so the request is never
 * metered. `Vary` splits anonymous traffic from credentialed traffic into separate
 * cache entries; anonymous responses stay as cacheable as they were before.
 */
const VARY_HEADERS = { Vary: 'Authorization, X-API-Key' } as const;

/** A sandbox-authenticated response is caller-specific and must never be shared. */
const NO_SHARED_CACHE = {
  ...VARY_HEADERS,
  'Cache-Control': 'private, no-store, max-age=0',
} as const;

/**
 * Meter a read endpoint for sandbox callers.
 *
 * If no sandbox credential is present the request passes through untouched (bar
 * the `Vary` header) — anonymous access to public reads behaves exactly as before.
 * If a key IS present it is validated and charged one unit of daily quota.
 */
export async function sandboxGate(req: {
  headers: { get(name: string): string | null };
}): Promise<SandboxGate> {
  const key = sandboxKeyFromHeaders(req.headers);
  if (!key) return { response: null, headers: { ...VARY_HEADERS }, authenticated: false };

  const auth = await authenticateSandboxKey(key);
  if (!auth.ok) {
    const headers: Record<string, string> = {
      ...NO_SHARED_CACHE,
      ...(auth.quota
        ? { ...sandboxRateHeaders(auth.quota), 'Retry-After': String(auth.quota.retryAfterSec) }
        : {}),
    };
    return {
      response: NextResponse.json(
        { success: false, error: auth.reason, code: auth.code },
        { status: auth.status, headers }
      ),
      headers: {},
      authenticated: false,
    };
  }

  void touchSandboxKey(auth.key!.id);
  return {
    response: null,
    headers: { ...NO_SHARED_CACHE, ...sandboxRateHeaders(auth.quota!) },
    authenticated: true,
  };
}
