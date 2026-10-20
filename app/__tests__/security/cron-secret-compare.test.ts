/**
 * Cron and admin secrets are compared in constant time, and an unset or empty
 * secret never matches.
 *
 * brain/cron, heartbeat, brain/scan and both admin cleanup routes compared the
 * presented secret with `===` / `!==`, which returns at the first differing
 * byte. The ownership cron already hashed both sides and used timingSafeEqual;
 * every route now shares that helper. admin/cleanup-duplicates also accepted
 * an empty header when ADMIN_SECRET was set to "".
 */

import crypto from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { secretMatches } from '@/lib/secret-match';

const mockFindMany = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200, json: async () => body }),
  },
}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => ({ findMany: (...a: unknown[]) => mockFindMany(...(a as [])) }) }),
}));
jest.mock('@/lib/brain', () => ({
  runOneShotScan: jest.fn(async () => ({ decisions: [] })),
  processExpiredAppeals: jest.fn(async () => 0),
  getBrainStatus: jest.fn(() => ({})),
}));
jest.mock('@/lib/brain/heartbeat-chain', () => ({
  appendToChain: jest.fn(async () => ({})),
  getCurrentBlockHeight: jest.fn(async () => 900000),
}));

import { GET as brainCron } from '@/app/api/v1/brain/cron/route';

describe('secretMatches', () => {
  it('matches only the exact secret', () => {
    expect(secretMatches('s3cret', 's3cret')).toBe(true);
    expect(secretMatches('s3creT', 's3cret')).toBe(false);
    expect(secretMatches('s3cret ', 's3cret')).toBe(false);
    expect(secretMatches('s3', 's3cret')).toBe(false);
  });

  it('fails closed on unset, empty or non-string input', () => {
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches('x', undefined)).toBe(false);
    expect(secretMatches('x', '')).toBe(false);
    expect(secretMatches(null, 'x')).toBe(false);
    expect(secretMatches(undefined, 'x')).toBe(false);
    expect(secretMatches(42, '42')).toBe(false);
    expect(secretMatches({ toString: () => 'x' }, 'x')).toBe(false);
  });

  it('compares with timingSafeEqual on fixed-length digests', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    secretMatches('a', 'a much longer secret value');
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0] as [Buffer, Buffer];
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
    spy.mockRestore();
  });
});

describe('GET /api/v1/brain/cron', () => {
  const ORIGINAL = { cron: process.env.CRON_SECRET, brain: process.env.BRAIN_SCAN_SECRET };
  afterEach(() => {
    for (const [k, v] of [['CRON_SECRET', ORIGINAL.cron], ['BRAIN_SCAN_SECRET', ORIGINAL.brain]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    mockFindMany.mockReset();
  });

  function call(authorization?: string) {
    const headers = new Headers(authorization ? { authorization } : {});
    return brainCron(new Request('http://test.local/api/v1/brain/cron', { headers })) as unknown as Promise<{ status: number }>;
  }

  it('refuses without a configured secret, whatever is sent', async () => {
    delete process.env.CRON_SECRET;
    delete process.env.BRAIN_SCAN_SECRET;
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('refuses a wrong or near-miss secret before touching the database', async () => {
    process.env.CRON_SECRET = 'cron-test-secret-aaaa';
    process.env.BRAIN_SCAN_SECRET = 'brain-test-secret-bbbb';
    for (const h of ['Bearer cron-test-secret-aaa', 'bearer cron-test-secret-aaaa', 'cron-test-secret-aaaa', 'Bearer brain-test-secret-bbb']) {
      expect((await call(h)).status).toBe(401);
    }
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('accepts CRON_SECRET and BRAIN_SCAN_SECRET', async () => {
    process.env.CRON_SECRET = 'cron-test-secret-aaaa';
    process.env.BRAIN_SCAN_SECRET = 'brain-test-secret-bbbb';
    mockFindMany.mockResolvedValue([]);
    expect((await call('Bearer cron-test-secret-aaaa')).status).not.toBe(401);
    expect((await call('Bearer brain-test-secret-bbbb')).status).not.toBe(401);
  });
});

describe('no route compares a secret with === or !==', () => {
  const routes = [
    'brain/cron', 'brain/scan', 'heartbeat', 'ownership/cron', 'admin/cleanup', 'admin/cleanup-duplicates',
  ];
  it.each(routes)('%s uses secretMatches', (route) => {
    const src = readFileSync(path.join(__dirname, '../../src/app/api/v1', route, 'route.ts'), 'utf8');
    expect(src).toContain("from '@/lib/secret-match'");
    expect(src).not.toMatch(/(===|!==)\s*`Bearer \$\{/);
    expect(src).not.toMatch(/(===|!==)\s*(process\.env\.)?[A-Z_]*SECRET\b/);
  });
});
