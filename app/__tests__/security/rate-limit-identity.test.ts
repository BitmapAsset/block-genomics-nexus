/**
 * §10 — WHO a rate-limit bucket belongs to, and which bucket a world write lands in.
 *
 * This became load-bearing when `/world/batch` started accepting `bg_vfy_` session
 * tokens. Before that, an agent could not batch at all; now the same credential
 * reaches both the single-write routes and the batch route, so the keying has to
 * put them in separate buckets and keep one caller out of another's.
 *
 * The counting arithmetic is proved in `rate-limit-db-sim.test.ts`. What is proved
 * here is the KEY: identity precedence, isolation between callers, and that a
 * live credential never appears in a limiter key in the clear.
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
} from '@/lib/api-rate-limit';
import type { RateCounter } from '@/lib/rate-limit-db';

// Real shape: the prefix plus 32 random bytes in hex. A short stand-in no longer
// reads as a session token and would quietly fall back to the IP bucket.
const SESSION = 'bg_vfy_' + '1'.repeat(64);
const OTHER_SESSION = 'bg_vfy_' + '2'.repeat(64);
const SANDBOX = 'bg_sbx_33333333333333333333333333333333';

/** A request exposing only the headers the limiter reads. */
function req(headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } };
}

const withSession = (token: string) => req({ authorization: `Bearer ${token}` });

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
  it('keys a session-credentialed caller by its session, not its IP', () => {
    const identity = rateLimitIdentity(
      req({ authorization: `Bearer ${SESSION}`, 'x-forwarded-for': '203.0.113.9' }),
    );

    expect(identity.startsWith('vfy:')).toBe(true);
    expect(identity).not.toContain('203.0.113.9');
  });

  it('prefers a session token over a sandbox key', () => {
    const identity = rateLimitIdentity(req({ authorization: `Bearer ${SESSION}`, 'x-api-key': SANDBOX }));

    expect(identity.startsWith('vfy:')).toBe(true);
  });

  it('keys a sandbox key by the key when there is no session', () => {
    expect(rateLimitIdentity(req({ 'x-api-key': SANDBOX })).startsWith('sbx:')).toBe(true);
  });

  it('falls back to client IP for an anonymous caller', () => {
    expect(rateLimitIdentity(req({ 'x-forwarded-for': '203.0.113.9' })).startsWith('ip:')).toBe(true);
  });

  it('never puts a live credential in the key', () => {
    // Limiter rows are not a place to store a working token.
    for (const identity of [
      rateLimitIdentity(withSession(SESSION)),
      rateLimitIdentity(req({ 'x-api-key': SANDBOX })),
    ]) {
      expect(identity).not.toContain(SESSION);
      expect(identity).not.toContain(SANDBOX);
    }
  });

  it('is stable for one caller and distinct between two', () => {
    expect(rateLimitIdentity(withSession(SESSION))).toBe(rateLimitIdentity(withSession(SESSION)));
    expect(rateLimitIdentity(withSession(SESSION))).not.toBe(rateLimitIdentity(withSession(OTHER_SESSION)));
  });

  it('does not throw on a request with no usable header bag', () => {
    expect(() => rateLimitIdentity({ headers: null as never })).not.toThrow();
  });

  it('reads the session from X-BG-Session too, for clients that spend Authorization elsewhere', () => {
    expect(rateLimitIdentity(req({ 'x-bg-session': SESSION }))).toBe(rateLimitIdentity(withSession(SESSION)));
  });
});

describe('§10: world writes and world batches are separate quotas', () => {
  it('charges different buckets for the same caller, so 20 batches never eat the 60 writes', async () => {
    const { counter, keys } = recordingCounter();

    await enforceRateLimit(withSession(SESSION), {
      bucket: 'v1-world-write',
      limit: WORLD_WRITE_LIMIT,
      counter,
    });
    await enforceRateLimit(withSession(SESSION), {
      bucket: 'v1-world-batch',
      limit: WORLD_BATCH_LIMIT,
      counter,
    });

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^v1-world-write:vfy:/);
    expect(keys[1]).toMatch(/^v1-world-batch:vfy:/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('gives two callers separate buckets on the same route', async () => {
    const { counter, keys } = recordingCounter();

    await enforceRateLimit(withSession(SESSION), { bucket: 'v1-world-batch', counter });
    await enforceRateLimit(withSession(OTHER_SESSION), { bucket: 'v1-world-batch', counter });

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
    });

    expect(rl.response).toBeNull();
    expect(rl.headers['X-RateLimit-Limit']).toBe('20');
    expect(rl.headers['X-RateLimit-Remaining']).toBe('19');
  });
});
