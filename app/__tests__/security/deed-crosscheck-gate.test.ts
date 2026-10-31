/**
 * Deed answers are cross-checked against an independent bitmap index before a
 * grant (lib/onchain/deed-crosscheck.ts, `DEED_CROSSCHECK_URL`).
 *
 * Every entry point runs the REAL gate code (bitmap-ownership, ownership-gate,
 * block-write-auth, session/verify, auth/verify, ownership-sync) and the REAL
 * cross-check client. Stood in for: the resolver's answer (`@/lib/onchain/deed`,
 * deeds registered explicitly per case), the live holder (`owner-freshness`,
 * with the source that named it), bodies (`ord`), and the network: the index
 * and Unisat answer through a stubbed `fetch`.
 *
 *   cross-check unset                           → unchanged behaviour
 *   names the deed + an ord host names signer   → grant
 *   names the deed + holder from sat tracker /
 *     Unisat only                               → 503
 *   names another inscription, or none          → 503 + alert + counter
 *   unreachable / timeout / malformed / behind  → 503
 *   resolver none + index names an id           → 503 + alert
 *   cron: no `action:'update'` unless the index names the deed and an ord host
 *   names the holder
 */

const mockEmitDeedVerified = jest.fn(async () => undefined);
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
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/lib/onchain/deed', () => require('../helpers/chain-ownership-mock').canonicalDeedFromFixture());

jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: jest.fn(),
  resolveInscriptionOwnerAddress: jest.fn(),
  invalidateInscriptionOwner: jest.fn(),
}));

jest.mock('@/lib/onchain/ord', () => ({
  getAddressInscriptions: jest.fn(),
  getInscriptionContent: jest.fn(),
  getInscriptionBody: jest.fn(),
  getStatus: async () => ({ height: 960000 }),
  getOrdHosts: () => [],
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
  emitDeedVerified: (...a: unknown[]) => mockEmitDeedVerified(...(a as [])),
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

import prisma from '@/lib/prisma';
import { getAddressInscriptions, getInscriptionBody, getInscriptionContent } from '@/lib/onchain/ord';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { requireLiveBlockOwner, requireVerifiedBlock } from '@/lib/ownership-gate';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { batchVerifyOwnership, verifyBlockOwnership } from '@/lib/ownership-sync';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { POST as authVerify } from '@/app/api/v1/auth/verify/route';
import { __resetDeedCrossCheckForTest, getDeedCrossCheckHealth } from '@/lib/onchain/deed-crosscheck';
import { clearDeeds, setDeed, setDeedVerdict } from '../helpers/chain-ownership-mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const CANON = 'aa'.repeat(32) + 'i0';
const COPY = 'bb'.repeat(32) + 'i0';
const OWNER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const INDEX = 'https://index.test/opi';

type IndexMode = 'names' | 'not-found' | 'unreachable' | 'timeout' | 'malformed' | 'behind' | 'http500';
type HolderMode = 'ord' | 'sat-tracker' | 'unisat';

let indexMode: IndexMode = 'names';
let indexNames: Record<number, string> = {};
let holderMode: HolderMode = 'ord';
const holders: Record<string, string> = {};
const bodies: Record<string, string> = {};
let calls: string[] = [];
let telegramSends = 0;

function stubFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith('https://api.telegram.org/')) {
      telegramSends++;
      return new Response('{"ok":true}', { status: 200 });
    }
    if (url.startsWith('https://open-api.unisat.io/')) {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      if (holderMode !== 'unisat' || !holders[id]) throw new Error('unisat unreachable');
      return new Response(JSON.stringify({ data: { address: holders[id] } }), { status: 200 });
    }
    if (url.startsWith(INDEX)) {
      if (indexMode === 'unreachable') throw new TypeError('fetch failed');
      if (indexMode === 'timeout') {
        const e = new Error('The operation was aborted due to timeout');
        e.name = 'TimeoutError';
        throw e;
      }
      if (indexMode === 'http500') return new Response('oops', { status: 500 });
      if (url.endsWith('/v1/bitmap/block_height')) {
        return new Response(indexMode === 'behind' ? String(BLOCK - 1) : '972000', { status: 200 });
      }
      const m = /bitmap_number=(\d+)$/.exec(url);
      if (m) {
        const n = Number(m[1]);
        if (indexMode === 'malformed') return new Response(JSON.stringify({ error: null, result: { inscription_id: 'not-an-id', bitmap_number: n } }), { status: 200 });
        if (indexMode === 'not-found' || !indexNames[n]) return new Response(JSON.stringify({ error: 'bitmap not found', result: null }), { status: 400 });
        return new Response(JSON.stringify({ error: null, result: { inscription_id: indexNames[n], bitmap_number: String(n) } }), { status: 200 });
      }
    }
    throw new Error(`network prohibited: ${url}`);
  }) as unknown as typeof fetch;
}

function world() {
  holders[CANON] = OWNER;
  holders[COPY] = OTHER;
  bodies[CANON] = `${BLOCK}.bitmap`;
  bodies[COPY] = `${BLOCK}.bitmap`;
  setDeed(BLOCK, CANON);
  indexNames = { [BLOCK]: CANON };
}

function crossCheckOn() {
  process.env.DEED_CROSSCHECK_URL = INDEX;
  process.env.DEED_CROSSCHECK_ALERT_CHAT_ID = '-100123';
  process.env.BG_TELEGRAM_BOT_TOKEN = 'test-token';
}

let errorLog: jest.SpyInstance;

beforeEach(() => {
  db.__reset();
  clearDeeds();
  __resetDeedCrossCheckForTest();
  for (const o of [holders, bodies]) for (const k of Object.keys(o)) delete o[k];
  delete process.env.DEED_CROSSCHECK_URL;
  delete process.env.DEED_CROSSCHECK_AUTH;
  delete process.env.DEED_CROSSCHECK_ALERT_CHAT_ID;
  delete process.env.BG_TELEGRAM_BOT_TOKEN;
  indexMode = 'names';
  indexNames = {};
  holderMode = 'ord';
  calls = [];
  telegramSends = 0;
  mockSession.current = null;
  mockEmitDeedVerified.mockClear();
  mockMint.mockReset().mockImplementation(async (wallet: string, blocks: number[]) => ({
    token: 'bg_vfy_minted',
    session: { tokenPrefix: 'bg_vfy_m', walletAddress: wallet, verifiedBlocks: blocks, expiresAt: new Date(Date.now() + 3600_000) },
  }));
  (resolveInscriptionOwner as jest.Mock).mockImplementation(async (id: string) => {
    if (!holders[id] || holderMode === 'unisat') return null;
    const source = holderMode === 'ord' ? 'ord.test' : 'esplora:mempool.space';
    return { address: holders[id], satpoint: `${id.slice(0, 64)}:0:0`, source };
  });
  (getInscriptionBody as jest.Mock).mockImplementation(async (id: string) =>
    bodies[id] === undefined ? null : { text: bodies[id], contentEncoding: null },
  );
  (getInscriptionContent as jest.Mock).mockImplementation(async (id: string) => bodies[id] ?? null);
  (getAddressInscriptions as jest.Mock).mockImplementation(async () => []);
  stubFetch();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DEED_CROSSCHECK_URL;
  delete process.env.DEED_CROSSCHECK_ALERT_CHAT_ID;
  delete process.env.BG_TELEGRAM_BOT_TOKEN;
});

function req(body: Record<string, unknown>): any {
  return { json: async () => body, headers: { get: () => null } };
}

async function everyEntryPoint(wallet: string, height: number) {
  mockSession.current = { id: 's1', walletAddress: wallet, verifiedBlocks: [height] };
  const header = { headers: { get: () => 'Bearer bg_vfy_test' } };
  const msg = { walletAddress: wallet, message: 'Block Genomics verification: n', signature: 'sig' };
  return {
    requireLiveBlockOwner: (await requireLiveBlockOwner(wallet, height)).status,
    requireVerifiedBlock: (await requireVerifiedBlock(header, height)).status,
    requireSignedBlockOwner: (await requireSignedBlockOwner(wallet, height)).status,
    sessionVerify: ((await sessionVerify(req({ ...msg, blocks: [height] }))) as any).status,
    authVerify: ((await authVerify(req({ ...msg, blockHeight: height }))) as any).status,
  };
}

const ALL = (status: number) => ({
  requireLiveBlockOwner: status,
  requireVerifiedBlock: status,
  requireSignedBlockOwner: status,
  sessionVerify: status,
  authVerify: status,
});
const GRANTED = { ...ALL(200), sessionVerify: 201 };

const alertLines = () =>
  errorLog.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('deed_crosscheck_disagreement'));

describe('cross-check unset: unchanged', () => {
  it('the deed holder is granted on an ord host answer, and the index is never asked', async () => {
    world();
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(GRANTED);
    expect(calls.filter((c) => c.includes('index.test'))).toEqual([]);
    expect(getDeedCrossCheckHealth()).toMatchObject({ configured: false, agreements: 0, disagreements: 0 });
  });

  it('a holder from the sat tracker is still granted, as before', async () => {
    world();
    holderMode = 'sat-tracker';
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(GRANTED);
  });
});

describe('cross-check names the deed', () => {
  it('and an ord host names the signer: grant at every entry point', async () => {
    world();
    crossCheckOn();
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(GRANTED);
    expect(getDeedCrossCheckHealth()).toMatchObject({ configured: true, host: 'index.test/opi', indexedHeight: 972000, disagreements: 0 });
    expect(getDeedCrossCheckHealth().agreements).toBeGreaterThanOrEqual(5);
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true);
  });

  it.each(['sat-tracker', 'unisat'] as const)('but the holder is known only from the %s: 503 everywhere, nothing minted', async (mode) => {
    world();
    crossCheckOn();
    holderMode = mode;
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(mockMint).not.toHaveBeenCalled();
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
  });

  it('a wallet holding a copy is still denied 403 everywhere', async () => {
    world();
    crossCheckOn();
    expect(await everyEntryPoint(OTHER, BLOCK)).toEqual(ALL(403));
  });

  it('the auth header value goes to the index only', async () => {
    world();
    crossCheckOn();
    process.env.DEED_CROSSCHECK_AUTH = 'Bearer index-token';
    const seen: Array<[string, string | null]> = [];
    const inner = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push([String(input), new Headers(init?.headers).get('Authorization')]);
      return inner(input, init);
    }) as unknown as typeof fetch;
    expect((await requireLiveBlockOwner(OWNER, BLOCK)).status).toBe(200);
    for (const [url, auth] of seen) expect(auth === 'Bearer index-token').toBe(url.startsWith(INDEX));
    expect(JSON.stringify(getDeedCrossCheckHealth())).not.toContain('index-token');
  });
});

describe('cross-check names another inscription, or none: 503 + alert + counter', () => {
  it('names a different inscription', async () => {
    world();
    crossCheckOn();
    indexNames = { [BLOCK]: COPY };
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(await everyEntryPoint(OTHER, BLOCK)).toEqual(ALL(503));
    expect(mockMint).not.toHaveBeenCalled();
    expect(getDeedCrossCheckHealth().disagreements).toBeGreaterThanOrEqual(10);
    expect(alertLines()).toHaveLength(1);
    expect(JSON.parse(alertLines()[0].replace(/^\[deed-crosscheck\] /, ''))).toMatchObject({ height: BLOCK, resolver: CANON, index: COPY });
    expect(telegramSends).toBe(1);
  });

  it('names no inscription', async () => {
    world();
    crossCheckOn();
    indexMode = 'not-found';
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(alertLines()).toHaveLength(1);
    expect(getDeedCrossCheckHealth().disagreements).toBeGreaterThanOrEqual(5);
  });

  it('without a chat id the alert is the log line alone', async () => {
    world();
    crossCheckOn();
    delete process.env.DEED_CROSSCHECK_ALERT_CHAT_ID;
    indexNames = { [BLOCK]: COPY };
    expect((await requireLiveBlockOwner(OWNER, BLOCK)).status).toBe(503);
    expect(alertLines()).toHaveLength(1);
    expect(telegramSends).toBe(0);
  });
});

describe('cross-check cannot answer: 503 retryable', () => {
  it.each(['unreachable', 'timeout', 'malformed', 'behind', 'http500'] as const)('index %s → 503 everywhere, no alert', async (mode) => {
    world();
    crossCheckOn();
    indexMode = mode;
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(mockMint).not.toHaveBeenCalled();
    expect(alertLines()).toHaveLength(0);
    expect(getDeedCrossCheckHealth().unavailable).toBeGreaterThanOrEqual(5);
  });

  it('the gate code is onchain_unavailable', async () => {
    world();
    crossCheckOn();
    indexMode = 'unreachable';
    expect(await requireLiveBlockOwner(OWNER, BLOCK)).toMatchObject({ ok: false, status: 503, code: 'onchain_unavailable' });
  });

  it('a configured URL that is not http(s) fails closed', async () => {
    world();
    process.env.DEED_CROSSCHECK_URL = 'ftp://index.test';
    expect((await requireLiveBlockOwner(OWNER, BLOCK)).status).toBe(503);
  });
});

describe('resolver none / disputed / undetermined with the cross-check set', () => {
  it('resolver none and the index names no inscription: 403 as before', async () => {
    world();
    crossCheckOn();
    setDeedVerdict(900000, 'none');
    expect(await requireLiveBlockOwner(OTHER, 900000)).toMatchObject({ status: 403, code: 'ownership_not_proven' });
  });

  it('resolver none but the index names an inscription: 503 + alert', async () => {
    world();
    crossCheckOn();
    setDeedVerdict(900000, 'none');
    indexNames = { 900000: COPY };
    expect((await requireLiveBlockOwner(OTHER, 900000)).status).toBe(503);
    expect(alertLines()).toHaveLength(1);
  });

  it.each(['undetermined', 'disputed'] as const)('resolver %s: 503, the index is not needed to say so', async (verdict) => {
    world();
    crossCheckOn();
    setDeedVerdict(BLOCK, verdict);
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
  });
});

describe('cron transfer path', () => {
  async function seedStaleRow() {
    await db.block.create({ data: { height: BLOCK, ownerAddress: OTHER, inscriptionId: CANON } });
  }

  it('unset: a live mismatch is action update (unchanged)', async () => {
    world();
    await seedStaleRow();
    expect(await verifyBlockOwnership(BLOCK, 'display')).toMatchObject({ action: 'update', onChainOwnerAddress: OWNER });
  });

  it('set, index names the deed, ord host names the holder: action update', async () => {
    world();
    crossCheckOn();
    await seedStaleRow();
    expect(await verifyBlockOwnership(BLOCK, 'display')).toMatchObject({ action: 'update', onChainOwnerAddress: OWNER });
  });

  it('set, holder from the sat tracker: no update, deferred', async () => {
    world();
    crossCheckOn();
    holderMode = 'sat-tracker';
    await seedStaleRow();
    const check = await verifyBlockOwnership(BLOCK, 'display');
    expect(check.action).toBe('none');
    expect(check.transferDeferred).toMatch(/ord host/);
    expect(check.onChainOwnerAddress).toBe(OWNER);
  });

  it.each(['names-other', 'not-found', 'unreachable', 'behind'] as const)('set, index %s: no update, and the batch releases nothing', async (mode) => {
    world();
    crossCheckOn();
    if (mode === 'names-other') indexNames = { [BLOCK]: COPY };
    else indexMode = mode;
    await seedStaleRow();
    const [check] = await batchVerifyOwnership([BLOCK]);
    expect(check.action).toBe('none');
    expect(check.transferDeferred).toMatch(/cross-check/);
    expect((await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress).toBe(OTHER);
    expect(await db.ownershipTransfer.findMany({})).toEqual([]);
  });

  it('set, matching row: the index is not asked', async () => {
    world();
    crossCheckOn();
    await db.block.create({ data: { height: BLOCK, ownerAddress: OWNER, inscriptionId: CANON } });
    expect(await verifyBlockOwnership(BLOCK, 'display')).toMatchObject({ action: 'none', match: true });
    expect(calls.filter((c) => c.includes('index.test'))).toEqual([]);
  });
});
