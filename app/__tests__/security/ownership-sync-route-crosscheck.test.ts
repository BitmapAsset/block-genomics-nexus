/**
 * POST /api/v1/ownership/sync with the deed cross-check
 * (lib/onchain/deed-crosscheck.ts, `DEED_CROSSCHECK_URL`).
 *
 * The route is the third way a live mismatch can start
 * `processOwnershipTransfer` (after the cron batch and `verifyAndSyncBlock`).
 * It must honour the same rule as the cron: with the cross-check set, a
 * transfer runs only when the index names the same deed and an ord host names
 * the holder; otherwise the answer is `transferred: false, deferred: true` and
 * nothing is released.
 *
 * Runs the REAL route, `verifyBlockOwnership`, `holderMayTriggerTransfer`,
 * `processOwnershipTransfer` and cross-check client. Stood in for: the
 * signature check (`@/lib/signed-action`), the DB (in memory), the resolver's
 * answer (`@/lib/onchain/deed`, deeds registered per case), the live holder
 * (`owner-freshness`, with the source that named it), and the network: the
 * index and Telegram answer through a stubbed `fetch`.
 *
 *   unset + mismatch + ord holder                     → transferred
 *   set, names the deed + ord holder                  → transferred
 *   set, names the deed + holder from the sat tracker → deferred (unchanged)
 *   set, names another inscription / none             → deferred + one alert line
 *   set, unreachable / behind                         → deferred, no alert
 *   caller neither stored owner nor deed holder       → 403 in every case
 */

const signedCalls: Array<{ address: unknown; spec: { action: string; blockHeight: number } }> = [];

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
  getAddressInscriptions: jest.fn(async () => []),
  getInscriptionContent: jest.fn(async () => null),
  getInscriptionBody: jest.fn(async () => null),
  getStatus: async () => ({ height: 960000 }),
  getOrdHosts: () => [],
}));

jest.mock('@/lib/onchain/sat-tracker', () => ({ readInscriptionBodyFromChain: async () => null }));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => true }));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined }));
jest.mock('@/lib/signed-action', () => ({
  verifySignedAction: async (address: unknown, _m: unknown, _s: unknown, _b: unknown, spec: { action: string; blockHeight: number }) => {
    signedCalls.push({ address, spec });
    return { ok: true };
  },
}));

import prisma from '@/lib/prisma';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { POST as OWNERSHIP_SYNC } from '@/app/api/v1/ownership/sync/route';
import { __resetDeedCrossCheckForTest, getDeedCrossCheckHealth } from '@/lib/onchain/deed-crosscheck';
import { clearDeeds, setDeed } from '../helpers/chain-ownership-mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const CANON = 'aa'.repeat(32) + 'i0';
const COPY = 'bb'.repeat(32) + 'i0';
// The deed holder (live), the stored owner (stale row), and a third wallet.
const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const STORED = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const STRANGER = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const INDEX = 'https://index.test/opi';

type IndexMode = 'names' | 'names-other' | 'not-found' | 'unreachable' | 'behind';
type HolderMode = 'ord' | 'sat-tracker';

let indexMode: IndexMode = 'names';
let holderMode: HolderMode = 'ord';
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
    if (url.startsWith(INDEX)) {
      if (indexMode === 'unreachable') throw new TypeError('fetch failed');
      if (url.endsWith('/v1/bitmap/block_height')) {
        return new Response(indexMode === 'behind' ? String(BLOCK - 1) : '972000', { status: 200 });
      }
      const m = /bitmap_number=(\d+)$/.exec(url);
      if (m) {
        if (indexMode === 'not-found') return new Response(JSON.stringify({ error: 'bitmap not found', result: null }), { status: 400 });
        const id = indexMode === 'names-other' ? COPY : CANON;
        return new Response(JSON.stringify({ error: null, result: { inscription_id: id, bitmap_number: m[1] } }), { status: 200 });
      }
    }
    throw new Error(`network prohibited: ${url}`);
  }) as unknown as typeof fetch;
}

function crossCheckOn() {
  process.env.DEED_CROSSCHECK_URL = INDEX;
  process.env.DEED_CROSSCHECK_ALERT_CHAT_ID = '-100123';
  process.env.BG_TELEGRAM_BOT_TOKEN = 'test-token';
}

/** A stale row: the stored owner is not the deed holder. */
async function staleRow() {
  setDeed(BLOCK, CANON);
  await db.block.create({ data: { height: BLOCK, ownerAddress: STORED, inscriptionId: CANON } });
  db.__rows('guardianAgent').push({
    id: 'g1', blockHeight: BLOCK, ownerAddress: STORED, name: 'Warden', soulMd: 'soul', status: 'active',
  });
}

let errorLog: jest.SpyInstance;

beforeEach(() => {
  db.__reset();
  clearDeeds();
  __resetDeedCrossCheckForTest();
  delete process.env.DEED_CROSSCHECK_URL;
  delete process.env.DEED_CROSSCHECK_AUTH;
  delete process.env.DEED_CROSSCHECK_ALERT_CHAT_ID;
  delete process.env.BG_TELEGRAM_BOT_TOKEN;
  indexMode = 'names';
  holderMode = 'ord';
  calls = [];
  telegramSends = 0;
  signedCalls.length = 0;
  (resolveInscriptionOwner as jest.Mock).mockImplementation(async (id: string) => {
    if (id !== CANON) return null;
    const source = holderMode === 'ord' ? 'ord.test' : 'esplora:mempool.space';
    return { address: HOLDER, satpoint: `${id.slice(0, 64)}:0:0`, source };
  });
  stubFetch();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DEED_CROSSCHECK_URL;
  delete process.env.DEED_CROSSCHECK_ALERT_CHAT_ID;
  delete process.env.BG_TELEGRAM_BOT_TOKEN;
});

async function sync(wallet: string) {
  const body = { walletAddress: wallet, signature: 'sig', message: 'Block Genomics Authorization v1', blockHeight: BLOCK };
  const res = (await OWNERSHIP_SYNC({ json: async () => body, headers: { get: () => null } } as any)) as any;
  return { status: res.status as number, body: res.body as any };
}

const alertLines = () =>
  errorLog.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('deed_crosscheck_disagreement'));
const storedOwner = async () => (await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress;
const transfers = async () => db.ownershipTransfer.findMany({});
const guardian = () => db.__rows('guardianAgent').find((g: any) => g.id === 'g1');

/** Nothing moved: the stale row, its guardian and the transfer log are as seeded. */
async function expectNothingReleased() {
  expect(await storedOwner()).toBe(STORED);
  expect(await transfers()).toEqual([]);
  expect(guardian()).toMatchObject({ ownerAddress: STORED, soulMd: 'soul', status: 'active' });
}

/** The caller check: a wallet that is neither the stored owner nor the deed holder is refused. */
async function expectStrangerRefused() {
  const res = await sync(STRANGER);
  expect(res.status).toBe(403);
  expect(res.body.success).toBe(false);
}

describe('cross-check unset: unchanged', () => {
  it('a live mismatch with an ord holder transfers, and the index is never asked', async () => {
    await staleRow();
    await expectStrangerRefused();
    const res = await sync(HOLDER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transferred: true, transfer: { previousOwner: STORED, newOwner: HOLDER, inscriptionId: CANON } });
    expect(await storedOwner()).toBe(HOLDER);
    expect(await transfers()).toHaveLength(1);
    expect(guardian()).toMatchObject({ status: 'released', soulMd: '' });
    expect(calls.filter((c) => c.includes('index.test'))).toEqual([]);
    expect(signedCalls[signedCalls.length - 1].spec).toMatchObject({ action: 'ownership.sync', blockHeight: BLOCK });
  });

  it('the stored owner may also start it', async () => {
    await staleRow();
    const res = await sync(STORED);
    expect(res.body.data).toMatchObject({ transferred: true });
    expect(await storedOwner()).toBe(HOLDER);
  });

  it('a holder from the sat tracker waits for an ord host, as before', async () => {
    await staleRow();
    holderMode = 'sat-tracker';
    const res = await sync(HOLDER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transferred: false, deferred: true });
    await expectNothingReleased();
  });

  it('a matching row needs no sync', async () => {
    setDeed(BLOCK, CANON);
    await db.block.create({ data: { height: BLOCK, ownerAddress: HOLDER, inscriptionId: CANON } });
    const res = await sync(HOLDER);
    expect(res.body.data).toMatchObject({ transferred: false });
    expect(res.body.data.deferred).toBeUndefined();
  });
});

describe('cross-check set, names the deed', () => {
  it('and an ord host names the holder: transferred', async () => {
    crossCheckOn();
    await staleRow();
    await expectStrangerRefused();
    const res = await sync(HOLDER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transferred: true, transfer: { newOwner: HOLDER } });
    expect(await storedOwner()).toBe(HOLDER);
    expect(await transfers()).toHaveLength(1);
    expect(alertLines()).toHaveLength(0);
    expect(getDeedCrossCheckHealth().agreements).toBeGreaterThanOrEqual(1);
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true);
  });

  it('but the holder is known only from the sat tracker: deferred, nothing released', async () => {
    crossCheckOn();
    await staleRow();
    holderMode = 'sat-tracker';
    await expectStrangerRefused();
    const res = await sync(HOLDER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transferred: false, deferred: true });
    await expectNothingReleased();
  });
});

describe('cross-check set and it does not confirm the deed: the transfer waits', () => {
  it.each([
    ['names another inscription', 'names-other', 1],
    ['names no inscription', 'not-found', 1],
    ['is unreachable', 'unreachable', 0],
    ['has not indexed the block yet', 'behind', 0],
  ] as const)('index %s (%s) → deferred, nothing released, %i alert line(s)', async (_label, mode, alerts) => {
    crossCheckOn();
    indexMode = mode;
    await staleRow();
    await expectStrangerRefused();
    for (const caller of [HOLDER, STORED]) {
      const res = await sync(caller);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ transferred: false, deferred: true });
      expect(res.body.data.message).not.toMatch(/matches/i);
      expect(res.body.data.message).not.toContain('index.test');
      expect(res.body.data.message).not.toContain(CANON);
    }
    await expectNothingReleased();
    expect(alertLines()).toHaveLength(alerts);
    expect(telegramSends).toBe(alerts);
    // The index is only ever read; the alert itself goes to Telegram as a POST.
    expect(calls.filter((c) => c.includes('index.test')).every((c) => c.startsWith('GET '))).toBe(true);
  });
});
