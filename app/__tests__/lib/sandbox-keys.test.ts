/**
 * Tests for the sandbox tier: key minting/hashing, authentication ordering,
 * daily quota enforcement, per-IP issuance capping, and the pure helpers the Edge
 * middleware relies on for read-only enforcement.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { sandboxKey: { findUnique: async () => null, update: async () => ({}) } },
}));

import {
  generateSandboxKey,
  hashSandboxKey,
  sandboxKeyPrefix,
  hashIp,
  authenticateSandboxKey,
  checkIssuanceAllowance,
  quotaKeyFor,
  issueKeyFor,
  sandboxRateHeaders,
  type SandboxKeyRecord,
} from '@/lib/sandbox-keys';
import {
  SANDBOX_KEY_PREFIX,
  SANDBOX_DAILY_LIMIT,
  SANDBOX_ISSUE_PER_IP_PER_DAY,
  DAY_MS,
  isReadMethod,
  bearerFrom,
  looksLikeSandboxKey,
  sandboxKeyFromHeaders,
  sandboxWriteBlockedBody,
} from '@/lib/sandbox-tier';
import type { RateCounter } from '@/lib/rate-limit-db';

/** Mirrors the atomic Postgres upsert: per-(key,window) post-increment count. */
function memoryCounter(): RateCounter {
  const state = new Map<string, { windowStart: number; count: number }>();
  return {
    async hit(key, windowStartMs) {
      const cur = state.get(key);
      if (!cur || cur.windowStart !== windowStartMs) {
        state.set(key, { windowStart: windowStartMs, count: 1 });
        return 1;
      }
      cur.count += 1;
      return cur.count;
    },
  };
}

function record(over: Partial<SandboxKeyRecord> & { keyHash: string }): SandboxKeyRecord {
  return {
    id: 'sbx_1',
    keyPrefix: 'bg_sbx_abcd1234',
    label: null,
    revokedAt: null,
    createdAt: new Date('2026-07-26T00:00:00Z'),
    ...over,
  };
}

const lookupOf = (rec: SandboxKeyRecord | null) => async () => rec;

describe('sandbox key primitives', () => {
  it('mints prefixed 256-bit keys that are unique per call', () => {
    const a = generateSandboxKey();
    const b = generateSandboxKey();
    expect(a.startsWith(SANDBOX_KEY_PREFIX)).toBe(true);
    expect(a).toHaveLength(SANDBOX_KEY_PREFIX.length + 64);
    expect(a).not.toEqual(b);
  });

  it('hashes deterministically to a 64-char sha256 hex digest', () => {
    const key = generateSandboxKey();
    expect(hashSandboxKey(key)).toEqual(hashSandboxKey(key));
    expect(hashSandboxKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSandboxKey(key)).not.toEqual(hashSandboxKey(generateSandboxKey()));
  });

  it('derives a non-secret display prefix that never leaks the full key', () => {
    const key = generateSandboxKey();
    const prefix = sandboxKeyPrefix(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(SANDBOX_KEY_PREFIX.length + 8);
    expect(prefix.length).toBeLessThan(key.length);
  });

  it('hashes IPs rather than storing them, and separates distinct sources', () => {
    expect(hashIp('1.2.3.4')).toEqual(hashIp('1.2.3.4'));
    expect(hashIp('1.2.3.4')).not.toEqual(hashIp('1.2.3.5'));
    expect(hashIp('1.2.3.4')).not.toContain('1.2.3.4');
  });
});

describe('authenticateSandboxKey', () => {
  const now = Date.UTC(2026, 6, 26, 12, 0, 0);

  it('rejects an unknown key without charging quota', async () => {
    const counter = memoryCounter();
    const hit = jest.spyOn(counter, 'hit');
    const res = await authenticateSandboxKey(generateSandboxKey(), {
      now,
      counter,
      lookup: lookupOf(null),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.code).toBe('invalid_key');
    // A garbage key must never burn a real key's allowance.
    expect(hit).not.toHaveBeenCalled();
  });

  it('rejects a revoked key', async () => {
    const key = generateSandboxKey();
    const res = await authenticateSandboxKey(key, {
      now,
      counter: memoryCounter(),
      lookup: lookupOf(record({ keyHash: hashSandboxKey(key), revokedAt: new Date() })),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.code).toBe('revoked_key');
  });

  it('fails closed when the identity lookup throws', async () => {
    const res = await authenticateSandboxKey(generateSandboxKey(), {
      now,
      counter: memoryCounter(),
      lookup: async () => {
        throw new Error('db down');
      },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it('admits a live key and reports remaining quota', async () => {
    const key = generateSandboxKey();
    const res = await authenticateSandboxKey(key, {
      now,
      counter: memoryCounter(),
      lookup: lookupOf(record({ keyHash: hashSandboxKey(key) })),
    });
    expect(res.ok).toBe(true);
    expect(res.quota!.limit).toBe(SANDBOX_DAILY_LIMIT);
    expect(res.quota!.count).toBe(1);
  });

  it(`admits exactly ${SANDBOX_DAILY_LIMIT} requests per day then returns 429`, async () => {
    const key = generateSandboxKey();
    const counter = memoryCounter();
    const lookup = lookupOf(record({ keyHash: hashSandboxKey(key) }));

    for (let i = 1; i <= SANDBOX_DAILY_LIMIT; i++) {
      const res = await authenticateSandboxKey(key, { now, counter, lookup });
      expect(res.ok).toBe(true);
      expect(res.quota!.count).toBe(i);
    }

    const over = await authenticateSandboxKey(key, { now, counter, lookup });
    expect(over.ok).toBe(false);
    expect(over.status).toBe(429);
    expect(over.code).toBe('quota_exceeded');
    expect(over.quota!.retryAfterSec).toBeGreaterThan(0);
  });

  it('resets the quota in the next UTC day window', async () => {
    const key = generateSandboxKey();
    const counter = memoryCounter();
    const lookup = lookupOf(record({ keyHash: hashSandboxKey(key) }));

    for (let i = 0; i < SANDBOX_DAILY_LIMIT; i++) {
      await authenticateSandboxKey(key, { now, counter, lookup });
    }
    expect((await authenticateSandboxKey(key, { now, counter, lookup })).ok).toBe(false);

    const tomorrow = await authenticateSandboxKey(key, { now: now + DAY_MS, counter, lookup });
    expect(tomorrow.ok).toBe(true);
    expect(tomorrow.quota!.count).toBe(1);
  });

  it('meters each key independently', async () => {
    const counter = memoryCounter();
    const a = generateSandboxKey();
    const b = generateSandboxKey();
    for (let i = 0; i < SANDBOX_DAILY_LIMIT; i++) {
      await authenticateSandboxKey(a, { now, counter, lookup: lookupOf(record({ keyHash: hashSandboxKey(a) })) });
    }
    const res = await authenticateSandboxKey(b, {
      now,
      counter,
      lookup: lookupOf(record({ id: 'sbx_2', keyHash: hashSandboxKey(b) })),
    });
    expect(res.ok).toBe(true);
    expect(res.quota!.count).toBe(1);
  });

  it('keys the limiter by key hash and never by the plaintext key', () => {
    const key = generateSandboxKey();
    const qk = quotaKeyFor(hashSandboxKey(key));
    expect(qk).toContain(hashSandboxKey(key));
    expect(qk).not.toContain(key);
    expect(issueKeyFor('iphash')).not.toEqual(qk);
  });
});

describe('issuance capping', () => {
  it(`allows ${SANDBOX_ISSUE_PER_IP_PER_DAY} keys per IP per day, then blocks`, async () => {
    const counter = memoryCounter();
    const now = Date.UTC(2026, 6, 26, 9, 0, 0);
    const ipHash = hashIp('9.9.9.9');

    for (let i = 0; i < SANDBOX_ISSUE_PER_IP_PER_DAY; i++) {
      expect((await checkIssuanceAllowance(ipHash, { now, counter })).allowed).toBe(true);
    }
    const blocked = await checkIssuanceAllowance(ipHash, { now, counter });
    expect(blocked.allowed).toBe(false);

    // A different source is unaffected.
    const other = await checkIssuanceAllowance(hashIp('8.8.8.8'), { now, counter });
    expect(other.allowed).toBe(true);
  });
});

describe('read-only enforcement helpers (Edge-safe)', () => {
  it('classifies only GET/HEAD/OPTIONS as reads', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS']) expect(isReadMethod(m)).toBe(true);
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE', 'post']) expect(isReadMethod(m)).toBe(false);
  });

  it('extracts sandbox credentials from Bearer and X-API-Key', () => {
    const key = generateSandboxKey();
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

    expect(sandboxKeyFromHeaders(headers({ authorization: `Bearer ${key}` }))).toBe(key);
    expect(sandboxKeyFromHeaders(headers({ 'x-api-key': key }))).toBe(key);
    expect(sandboxKeyFromHeaders(headers({}))).toBeNull();
    // An agent token is a different tier and must not be picked up as sandbox.
    expect(sandboxKeyFromHeaders(headers({ authorization: 'Bearer bg_agent_deadbeef' }))).toBeNull();
  });

  it('recognises sandbox key shape without validating it', () => {
    expect(looksLikeSandboxKey(generateSandboxKey())).toBe(true);
    expect(looksLikeSandboxKey('bg_agent_x')).toBe(false);
    expect(looksLikeSandboxKey(null)).toBe(false);
    expect(bearerFrom('Bearer  ')).toBeNull();
    expect(bearerFrom('Basic abc')).toBeNull();
  });

  it('returns an actionable upgrade path when a write is blocked', () => {
    const body = sandboxWriteBlockedBody('POST', '/api/v1/experiences');
    expect(body.success).toBe(false);
    expect(body.code).toBe('sandbox_read_only');
    expect(body.error).toContain('read-only');
    expect(body.upgrade.steps.length).toBeGreaterThan(0);
    expect(body.upgrade.steps.join(' ')).toContain('/api/v1/challenge');
  });
});

describe('rate-limit headers', () => {
  it('exposes limit/remaining/reset and tags the tier', () => {
    const h = sandboxRateHeaders({
      allowed: true,
      count: 3,
      limit: SANDBOX_DAILY_LIMIT,
      resetAt: 1_800_000_000_000,
      retryAfterSec: 42,
    });
    expect(h['X-RateLimit-Limit']).toBe(String(SANDBOX_DAILY_LIMIT));
    expect(h['X-RateLimit-Remaining']).toBe(String(SANDBOX_DAILY_LIMIT - 3));
    expect(h['X-RateLimit-Reset']).toBe('1800000000');
    expect(h['X-BG-Tier']).toBe('sandbox');
  });

  it('never reports negative remaining once the quota is blown', () => {
    const h = sandboxRateHeaders({
      allowed: false,
      count: SANDBOX_DAILY_LIMIT + 7,
      limit: SANDBOX_DAILY_LIMIT,
      resetAt: 1_800_000_000_000,
      retryAfterSec: 42,
    });
    expect(h['X-RateLimit-Remaining']).toBe('0');
  });
});
