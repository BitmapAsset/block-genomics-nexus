/**
 * §10 — WHO a rate-limit bucket belongs to, and which bucket a world write lands in.
 *
 * This became load-bearing when `/world/batch` started accepting `bg_vfy_` session
 * tokens. Before that, an agent could not batch at all; now the same credential
 * reaches both the single-write routes and the batch route, so the keying has to
 * put them in separate buckets and keep one caller out of another's.
 *
 * The counting arithmetic is proved in `rate-limit-db-sim.test.ts`. What is proved
 * here is the KEY: identity precedence, isolation between callers, that a live
 * credential never appears in a limiter key in the clear, and (bg48 Q-11) that a
 * credential earns its own bucket only once it AUTHENTICATES — a random
 * credential-shaped header used to mint a fresh bucket per request.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

import {
  enforceRateLimit,
  rateLimitIdentity,
  WORLD_WRITE_LIMIT,
  WORLD_BATCH_LIMIT,
  type IdentityOptions,
} from '@/lib/api-rate-limit';
import type { RateCounter } from '@/lib/rate-limit-db';
import { hashSessionToken, type VerifiedSessionRecord } from '@/lib/verified-sessions';
import { hashSandboxKey, type SandboxKeyRecord } from '@/lib/sandbox-keys';

// Real shape: the prefix plus 32 random bytes in hex. A short stand-in no longer
// reads as a session token and would quietly fall back to the IP bucket.
const SESSION = 'bg_vfy_' + '1'.repeat(64);
const SAME_WALLET_SESSION = 'bg_vfy_' + '4'.repeat(64);
const OTHER_SESSION = 'bg_vfy_' + '2'.repeat(64);
const SANDBOX = 'bg_sbx_33333333333333333333333333333333';
const WALLET = 'bc1pwalletone000000000000000000000000000000000';
const OTHER_WALLET = 'bc1pwallettwo000000000000000000000000000000000';

/** Sessions the server actually issued, keyed by token hash, as the DB would hold them. */
function issuedSessions(entries: Array<[string, string]>): IdentityOptions['lookupSession'] {
  const byHash = new Map<string, VerifiedSessionRecord>();
  for (const [token, walletAddress] of entries) {
    const tokenHash = hashSessionToken(token);
    byHash.set(tokenHash, {
      id: `s_${token.slice(-4)}`,
      tokenHash,
      tokenPrefix: token.slice(0, 15),
      walletAddress,
      verifiedBlocks: [],
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });
  }
  return async (hash) => byHash.get(hash) ?? null;
}

const liveSandbox: IdentityOptions['lookupSandboxKey'] = async (hash) =>
  hash === hashSandboxKey(SANDBOX)
    ? ({ id: 'k1', keyHash: hash, keyPrefix: 'bg_sbx_33333333', label: null, revokedAt: null, createdAt: new Date() } as SandboxKeyRecord)
    : null;

/** The credentials this server issued: two sessions for WALLET, one for OTHER_WALLET, one sandbox key. */
const ISSUED: IdentityOptions = {
  lookupSession: issuedSessions([
    [SESSION, WALLET],
    [SAME_WALLET_SESSION, WALLET],
    [OTHER_SESSION, OTHER_WALLET],
  ]),
  lookupSandboxKey: liveSandbox,
};

/** A request exposing only the headers the limiter reads. */
function req(headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } };
}

const withSession = (token: string, ip = '203.0.113.9') => req({ authorization: `Bearer ${token}`, 'x-forwarded-for': ip });
const randomSessionShape = () => 'bg_vfy_' + [...Array(64)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

/** Records every key charged, so the bucket a route lands in is observable. */
function recordingCounter(): { counter: RateCounter; keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    counter: {
      async hit(key: string) {
        keys.push(key);
        return 1;
      },
    },
  };
}

describe('§10: identity precedence', () => {
  it('keys an authenticated session by its wallet, not its IP', async () => {
    const identity = await rateLimitIdentity(withSession(SESSION), ISSUED);

    expect(identity.startsWith('vfy:')).toBe(true);
    expect(identity).not.toContain('203.0.113.9');
  });

  it('prefers a session token over a sandbox key', async () => {
    const identity = await rateLimitIdentity(req({ authorization: `Bearer ${SESSION}`, 'x-api-key': SANDBOX }), ISSUED);

    expect(identity.startsWith('vfy:')).toBe(true);
  });

  it('keys a live sandbox key by the key when there is no session', async () => {
    expect((await rateLimitIdentity(req({ 'x-api-key': SANDBOX }), ISSUED)).startsWith('sbx:')).toBe(true);
  });

  it('falls back to client IP for an anonymous caller', async () => {
    expect((await rateLimitIdentity(req({ 'x-forwarded-for': '203.0.113.9' }), ISSUED)).startsWith('ip:')).toBe(true);
  });

  it('never puts a live credential or a wallet in the key', async () => {
    // Limiter rows are not a place to store a working token.
    for (const identity of [
      await rateLimitIdentity(withSession(SESSION), ISSUED),
      await rateLimitIdentity(req({ 'x-api-key': SANDBOX }), ISSUED),
    ]) {
      expect(identity).not.toContain(SESSION);
      expect(identity).not.toContain(SANDBOX);
      expect(identity).not.toContain(WALLET);
    }
  });

  it('gives one wallet one bucket however many sessions it holds, and two wallets two', async () => {
    const a = await rateLimitIdentity(withSession(SESSION), ISSUED);
    expect(await rateLimitIdentity(withSession(SAME_WALLET_SESSION), ISSUED)).toBe(a);
    expect(await rateLimitIdentity(withSession(OTHER_SESSION), ISSUED)).not.toBe(a);
  });

  it('does not throw on a request with no usable header bag', async () => {
    await expect(rateLimitIdentity({ headers: null as never }, ISSUED)).resolves.toMatch(/^ip:/);
  });

  it('reads the session from X-BG-Session too, for clients that spend Authorization elsewhere', async () => {
    expect(await rateLimitIdentity(req({ 'x-bg-session': SESSION }), ISSUED)).toBe(
      await rateLimitIdentity(withSession(SESSION), ISSUED),
    );
  });
});

describe('Q-11: a credential-shaped header is not a bucket until it authenticates', () => {
  it('charges a well-formed but never-issued session token to the IP', async () => {
    const forged = await rateLimitIdentity(withSession(randomSessionShape()), ISSUED);
    expect(forged).toBe('ip:203.0.113.9');
  });

  it('a fresh random token per request cannot mint a fresh bucket per request', async () => {
    const { counter, keys } = recordingCounter();
    for (let i = 0; i < 5; i++) {
      await enforceRateLimit(req({ 'x-bg-session': randomSessionShape(), 'x-forwarded-for': '198.51.100.7' }), {
        bucket: 'v1-inscriptions-scan',
        counter,
        ...ISSUED,
      });
    }
    expect(new Set(keys)).toEqual(new Set(['v1-inscriptions-scan:ip:198.51.100.7']));
  });

  it('charges an unknown sandbox key to the IP', async () => {
    const unknown = 'bg_sbx_' + 'f'.repeat(32);
    expect(await rateLimitIdentity(req({ 'x-api-key': unknown, 'x-forwarded-for': '203.0.113.9' }), ISSUED)).toBe(
      'ip:203.0.113.9',
    );
  });

  it('a revoked sandbox key is not live', async () => {
    const revoked: IdentityOptions = {
      lookupSandboxKey: async (hash) =>
        ({ id: 'k1', keyHash: hash, keyPrefix: 'x', label: null, revokedAt: new Date(), createdAt: new Date() }) as SandboxKeyRecord,
    };
    expect(await rateLimitIdentity(req({ 'x-api-key': SANDBOX, 'x-forwarded-for': '203.0.113.9' }), revoked)).toBe(
      'ip:203.0.113.9',
    );
  });

  it('a session lookup outage falls back to the IP bucket, never a free one', async () => {
    const down: IdentityOptions = {
      lookupSession: async () => {
        throw new Error('db down');
      },
    };
    expect(await rateLimitIdentity(withSession(SESSION), down)).toBe('ip:203.0.113.9');
  });
});

describe('§10: world writes and world batches are separate quotas', () => {
  it('charges different buckets for the same caller, so 20 batches never eat the 60 writes', async () => {
    const { counter, keys } = recordingCounter();

    await enforceRateLimit(withSession(SESSION), {
      bucket: 'v1-world-write',
      limit: WORLD_WRITE_LIMIT,
      counter,
      ...ISSUED,
    });
    await enforceRateLimit(withSession(SESSION), {
      bucket: 'v1-world-batch',
      limit: WORLD_BATCH_LIMIT,
      counter,
      ...ISSUED,
    });

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^v1-world-write:vfy:/);
    expect(keys[1]).toMatch(/^v1-world-batch:vfy:/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('gives two callers separate buckets on the same route', async () => {
    const { counter, keys } = recordingCounter();

    await enforceRateLimit(withSession(SESSION), { bucket: 'v1-world-batch', counter, ...ISSUED });
    await enforceRateLimit(withSession(OTHER_SESSION), { bucket: 'v1-world-batch', counter, ...ISSUED });

    expect(keys[0]).not.toBe(keys[1]);
  });

  it('keeps the documented ceilings — 60 single writes, 20 batches', () => {
    // §10 quotes these numbers; the spec and the code must not drift apart.
    expect(WORLD_WRITE_LIMIT).toBe(60);
    expect(WORLD_BATCH_LIMIT).toBe(20);
  });

  it('advertises the ceiling it enforced', async () => {
    const { counter } = recordingCounter();

    const rl = await enforceRateLimit(withSession(SESSION), {
      bucket: 'v1-world-batch',
      limit: WORLD_BATCH_LIMIT,
      counter,
      ...ISSUED,
    });

    expect(rl.response).toBeNull();
    expect(rl.headers['X-RateLimit-Limit']).toBe('20');
    expect(rl.headers['X-RateLimit-Remaining']).toBe('19');
  });
});
