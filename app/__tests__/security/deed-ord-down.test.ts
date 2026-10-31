/**
 * Every ord host down (403 or a timeout): no entry point grants and none
 * hard-denies. The answer is the retryable 503, even while the Esplora sat
 * tracker can still name a holder.
 *
 * Unlike the other gate suites this one runs the REAL deed module and the REAL
 * vendored resolver (gate → deed → resolver as one chain); only the network
 * (`fetch`), the database (in memory, no DeedVerdict table) and the holder
 * lookup are stood in for.
 */

const mockMint = jest.fn();
const mockSession = { current: null as null | { id: string; walletAddress: string; verifiedBlocks: number[] } };

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
  NextRequest: class {},
  after: () => undefined,
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

// The sat tracker still answers: the holder is known, the deed is not.
jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: jest.fn(async () => ({ address: 'bc1qowner', satpoint: 'x:0:0', source: 'esplora:mempool.space' })),
  resolveInscriptionOwnerAddress: jest.fn(async () => 'bc1qowner'),
  invalidateInscriptionOwner: jest.fn(),
}));

jest.mock('@/lib/onchain/sat-tracker', () => ({ readInscriptionBodyFromChain: async () => null }));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => true }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => true }));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined }));
jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFrom: () => '127.0.0.1',
}));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  AUTH_VERIFY_LIMIT: 10,
}));
jest.mock('@/lib/block-event-emitters', () => ({
  emitDeedVerified: jest.fn(async () => undefined),
  walletProofOf: () => ({ scheme: 'bip322' }),
}));
jest.mock('@/lib/verified-sessions', () => ({
  authenticateSession: async () =>
    mockSession.current ? { ok: true, status: 200, session: mockSession.current } : { ok: false, status: 401, reason: 'no session' },
  sessionCoversBlock: (s: { verifiedBlocks: number[] }, h: number) => s.verifiedBlocks.includes(h),
  sessionTokenFromHeaders: () => 'bg_vfy_test',
  touchSession: async () => undefined,
  mintVerifiedSession: (...a: unknown[]) => mockMint(...(a as [])),
  MAX_BLOCKS_PER_SESSION: 20,
  SESSION_CHALLENGE_PURPOSE: 'session',
}));

import { requireLiveBlockOwner, requireVerifiedBlock } from '@/lib/ownership-gate';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { POST as authVerify } from '@/app/api/v1/auth/verify/route';
import { __resetDeedCacheForTest, canonicalDeedFor } from '@/lib/onchain/deed';
import { __resetDeedCrossCheckForTest } from '@/lib/onchain/deed-crosscheck';

/* eslint-disable @typescript-eslint/no-explicit-any */
const OWNER = 'bc1qowner';
let ordMode: '403' | 'timeout' = '403';
let calls: string[] = [];

beforeEach(() => {
  __resetDeedCacheForTest();
  __resetDeedCrossCheckForTest();
  delete process.env.DEED_CROSSCHECK_URL;
  calls = [];
  mockMint.mockReset();
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith('https://ordinals.com')) {
      if (ordMode === 'timeout') {
        const e = new Error('The operation was aborted due to timeout');
        e.name = 'TimeoutError';
        throw e;
      }
      return new Response('<title>Just a moment...</title>', { status: 403 });
    }
    if (url.endsWith('/blocks/tip/height')) return new Response('972000', { status: 200 });
    if (url.startsWith('https://index.test')) {
      if (url.endsWith('/v1/bitmap/block_height')) return new Response('972000', { status: 200 });
      return new Response(JSON.stringify({ error: null, result: { inscription_id: 'cc'.repeat(32) + 'i0', bitmap_number: url.split('=').pop() } }), { status: 200 });
    }
    if (url.startsWith('https://open-api.unisat.io/')) throw new Error('unisat unreachable');
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DEED_CROSSCHECK_URL;
});

function req(body: Record<string, unknown>): any {
  return { json: async () => body, headers: { get: () => null } };
}

async function everyEntryPoint(wallet: string, height: number) {
  mockSession.current = { id: 's1', walletAddress: wallet, verifiedBlocks: [height] };
  const header = { headers: { get: () => 'Bearer bg_vfy_test' } };
  const msg = { walletAddress: wallet, message: 'Block Genomics verification: n', signature: 'sig' };
  const out: Record<string, number> = {};
  out.requireLiveBlockOwner = (await requireLiveBlockOwner(wallet, height)).status;
  __resetDeedCacheForTest();
  out.requireVerifiedBlock = (await requireVerifiedBlock(header, height)).status;
  __resetDeedCacheForTest();
  out.requireSignedBlockOwner = (await requireSignedBlockOwner(wallet, height)).status;
  __resetDeedCacheForTest();
  out.sessionVerify = ((await sessionVerify(req({ ...msg, blocks: [height] }))) as any).status;
  __resetDeedCacheForTest();
  out.authVerify = ((await authVerify(req({ ...msg, blockHeight: height }))) as any).status;
  return out;
}

const ALL_503 = {
  requireLiveBlockOwner: 503,
  requireVerifiedBlock: 503,
  requireSignedBlockOwner: 503,
  sessionVerify: 503,
  authVerify: 503,
};

describe.each(['403', 'timeout'] as const)('every ord host %s', (mode) => {
  beforeEach(() => {
    ordMode = mode;
  });

  it.each([612888, 718840, 840000, 942000])('block %s: the deed is undetermined, every entry point answers 503', async (height) => {
    const deed = await canonicalDeedFor(height);
    expect(deed.verdict).toBe('undetermined');
    __resetDeedCacheForTest();
    expect(await everyEntryPoint(OWNER, height)).toEqual(ALL_503);
    expect(mockMint).not.toHaveBeenCalled();
  }, 30_000);

  it('with the cross-check set, still 503 (never 200, never 403)', async () => {
    process.env.DEED_CROSSCHECK_URL = 'https://index.test';
    expect(await everyEntryPoint(OWNER, 840000)).toEqual(ALL_503);
  }, 30_000);

  it('the gate never writes: only GET requests left the process', async () => {
    await everyEntryPoint(OWNER, 718840);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true);
  }, 30_000);
});
