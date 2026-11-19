/**
 * A holder counts only when two independent sources agree, and the deeds the
 * repository recorded are answered without an ord host.
 *
 * Runs the REAL gate (`requireLiveBlockOwner`), `bitmap-ownership.ts`,
 * `deed.ts` with its pins, `owner-freshness.ts`, the sat tracker and the ord
 * client, and the real `GET /api/v1/ownership/[height]` route. Only the network
 * (`fetch`, per host) and the database (in memory) are stood in for.
 *
 * Fixtures: fixtures/esplora-deed-history.json (Esplora recording of
 * 2026-10-23, served for both mempool.space and blockstream.info); the holders
 * and satpoints of 720,143 and 612,888 are those of lib/sat-tracker.test.ts
 * GROUND_TRUTH; the made-up address OTHER is the one of
 * api/ownership-availability.test.ts. The one ord host, ord2.example, answers
 * 403 unless a case sets it.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map(Object.entries(init?.headers ?? {})),
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

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
  AUTH_VERIFY_LIMIT: 10,
}));
jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFrom: () => '127.0.0.1',
}));

import fixture from '../fixtures/esplora-deed-history.json';
import prisma from '@/lib/prisma';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { verifyInscriptionOwnership } from '@/lib/onchain/bitmap-ownership';
import { canonicalDeedFor, __resetDeedCacheForTest } from '@/lib/onchain/deed';
import { __resetDeedCrossCheckForTest } from '@/lib/onchain/deed-crosscheck';
import { resolveInscriptionOwner, __resetOwnerObservations } from '@/lib/onchain/owner-freshness';
import { trackInscriptionHolder, __resetSatTracker } from '@/lib/onchain/sat-tracker';
import { __resetOrdClientForTest } from '@/lib/onchain/ord';
import { GET as byHeight } from '@/app/api/v1/ownership/[height]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const realFetch = global.fetch;

const MEMPOOL = 'https://mempool.space/api';
const BLOCKSTREAM = 'https://blockstream.info/api';

const H720 = 720143;
const REVEAL720 = '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5';
const ID720 = `${REVEAL720}i0`;
const HOLDER720 = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
/** The transaction of 720,143's recorded final satpoint, and the last spend on its path. */
const FINAL720 = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1';
const SP720 = `${FINAL720}:1:0`;

const H612 = 612888;
const ID612 = 'daf63d78f6e4cbf8cc5d0b375978c9c707849b5ee0dac909813cef7db66da2d9i0';
const HOLDER612 = 'bc1p4cdhx2hkq9kutw0wvnn77ekevrm2ga9pfmq4td426js5vyhrexys80ewp6';
const SP612 = 'd8793ebdd86620feb9fec577210ff73b0da519982a861eebd8f99a085491ed6a:2:0';

const OTHER = 'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsomeoneelse';
const BAD_TXID = 'ab'.repeat(31) + 'a/';

const HOLDERS: Record<string, { address: string; satpoint: string }> = {
  [ID720]: { address: HOLDER720, satpoint: SP720 },
  [ID612]: { address: HOLDER612, satpoint: SP612 },
};

type Reply = { status: number; body: unknown };
const recorded = (fixture as { responses: Record<string, Reply> }).responses;

let ord: '403' | 'holder' = '403';
let mempool: 'replay' | 'down' | 'bad-txid' = 'replay';
let blockstream: 'replay' | 'down' | 'other-holder' | 'spend-missing' = 'replay';
let unisat = false;
let calls: { url: string; init?: RequestInit }[] = [];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const down = () => new Response('down', { status: 503 });
const notFound = () => new Response('not found', { status: 404 });

function fromRecording(path: string): Response {
  const r = recorded[path];
  if (!r) return notFound();
  return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
}

beforeEach(() => {
  db.__reset();
  __resetDeedCacheForTest();
  __resetDeedCrossCheckForTest();
  delete process.env.DEED_CROSSCHECK_URL;
  __resetOwnerObservations();
  __resetSatTracker();
  __resetOrdClientForTest({ list: 'https://ord2.example', single: null, throttleMs: 0, backoffMs: 0 });
  ord = '403';
  mempool = 'replay';
  blockstream = 'replay';
  unisat = false;
  calls = [];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    calls.push({ url, init });
    const host = new URL(url).hostname;
    if (host === 'ord2.example') {
      if (ord === '403') return new Response('<title>Just a moment...</title>', { status: 403 });
      const m = /\/r\/inscription\/([0-9a-f]{64}i\d+)$/.exec(url);
      const h = m ? HOLDERS[m[1]] : undefined;
      return h ? json(200, h) : notFound();
    }
    if (url.startsWith(MEMPOOL)) {
      if (mempool === 'down') return down();
      const path = url.slice(MEMPOOL.length);
      if (mempool === 'bad-txid' && path.startsWith(`/tx/${REVEAL720}/outspend/`)) {
        return json(200, { spent: true, txid: BAD_TXID, vin: 0, status: { confirmed: true, block_height: 800_000 } });
      }
      return fromRecording(path);
    }
    if (url.startsWith(BLOCKSTREAM)) {
      if (blockstream === 'down') return down();
      const path = url.slice(BLOCKSTREAM.length);
      if (path === `/tx/${FINAL720}` && blockstream === 'spend-missing') return notFound();
      if (path === `/tx/${FINAL720}` && blockstream === 'other-holder') {
        const tx = JSON.parse(JSON.stringify(recorded[path].body));
        tx.vout[1].scriptpubkey_address = OTHER;
        return json(200, tx);
      }
      return fromRecording(path);
    }
    if (host === 'open-api.unisat.io') {
      return unisat ? json(200, { data: { address: HOLDER720 } }) : down();
    }
    return notFound();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
  delete process.env.DEED_CROSSCHECK_URL;
});

afterAll(() => {
  __resetOrdClientForTest();
});

async function seed(height: number, ownerAddress: string, inscriptionId: string) {
  await db.block.create({ data: { height, ownerAddress, inscriptionId } });
}

async function read(height: number) {
  const res: any = await byHeight(
    { nextUrl: new URL(`http://test.local/api/v1/ownership/${height}`), headers: new Headers() } as any,
    { params: Promise.resolve({ height: String(height) }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

const gate = async (wallet: string, height: number) => (await requireLiveBlockOwner(wallet, height)).status;
const warnCalls = () => (console.warn as unknown as jest.Mock).mock.calls as unknown[][];

describe('two sources agree: the holder acts', () => {
  it('(1) 720,143: both Esplora hosts agree → 200, and the answer names both', async () => {
    await seed(H720, HOLDER720, ID720);
    expect(await gate(HOLDER720, H720)).toBe(200);
    expect(await read(H720)).toMatchObject({
      verdict: 'match',
      chain: 'ok',
      onChainOwner: HOLDER720,
      sources: ['esplora:mempool.space', 'esplora:blockstream.info'],
    });
  });

  it('(2) 612,888: the same', async () => {
    await seed(H612, HOLDER612, ID612);
    expect(await gate(HOLDER612, H612)).toBe(200);
    expect(await read(H612)).toMatchObject({
      verdict: 'match',
      chain: 'ok',
      onChainOwner: HOLDER612,
      sources: ['esplora:mempool.space', 'esplora:blockstream.info'],
    });
  });

  it('(3) another wallet → 403', async () => {
    await seed(H720, HOLDER720, ID720);
    expect(await gate(OTHER, H720)).toBe(403);
  });

  it('(12) ord and both hosts agree → three sources, the ord host first', async () => {
    ord = 'holder';
    const owner = await resolveInscriptionOwner(ID720, 'auth');
    expect(owner).toMatchObject({ address: HOLDER720, satpoint: SP720 });
    expect((owner as any).sources).toEqual(['ord2.example', 'esplora:mempool.space', 'esplora:blockstream.info']);
  });
});

describe('fewer than two agreeing sources: retry, never a grant', () => {
  it('(4) blockstream down → 503, and the answer says unavailable', async () => {
    blockstream = 'down';
    await seed(H720, HOLDER720, ID720);
    expect(await gate(HOLDER720, H720)).toBe(503);
    expect((await read(H720)).chain).toBe('unavailable');
  });

  it('(5) the hosts name different holders → 503, logged without an address; afterwards both start from the reveal', async () => {
    blockstream = 'other-holder';
    await seed(H720, HOLDER720, ID720);
    expect(await gate(HOLDER720, H720)).toBe(503);
    const disagree = warnCalls().filter((c) => typeof c[0] === 'string' && c[0].startsWith('[owner-freshness] sources disagree on'));
    expect(disagree).toHaveLength(1);
    expect(disagree[0][0]).toContain('esplora:mempool.space');
    expect(disagree[0][0]).toContain('esplora:blockstream.info');
    expect(JSON.stringify(warnCalls())).not.toContain('bc1');
    expect((await read(H720)).chain).toBe('unavailable');

    calls = [];
    blockstream = 'replay';
    expect(await gate(HOLDER720, H720)).toBe(200);
    const urls = calls.map((c) => c.url);
    expect(urls).toContain(`${MEMPOOL}/tx/${REVEAL720}`);
    expect(urls).toContain(`${BLOCKSTREAM}/tx/${REVEAL720}`);
  });

  it('(6) an ord host alone, both Esplora hosts down → null', async () => {
    ord = 'holder';
    mempool = 'down';
    blockstream = 'down';
    expect(await resolveInscriptionOwner(ID720, 'auth')).toBeNull();
  });

  it('(7) no single-source fallback: Unisat is never asked', async () => {
    mempool = 'down';
    blockstream = 'down';
    unisat = true;
    expect(await verifyInscriptionOwnership(HOLDER720, ID720, H720)).toMatchObject({ verified: false, unavailable: true });
    expect(calls.some((c) => c.url.includes('unisat'))).toBe(false);
  });

  it('(11) blockstream cannot serve a spend its own outspend named → 503 and a disagreement', async () => {
    blockstream = 'spend-missing';
    await seed(H720, HOLDER720, ID720);
    expect(await gate(HOLDER720, H720)).toBe(503);
    expect((await read(H720)).chain).toBe('unavailable');
    expect(await trackInscriptionHolder(ID720)).toEqual({ status: 'unknown', reason: 'esplora_disagreement' });
  });

  it('(13) ord and mempool agree while blockstream dissents → null', async () => {
    ord = 'holder';
    blockstream = 'spend-missing';
    expect(await resolveInscriptionOwner(ID720, 'auth')).toBeNull();
  });
});

describe('requests', () => {
  it('(8) a spend txid that is not 64 hex never enters a URL', async () => {
    mempool = 'bad-txid';
    expect(await trackInscriptionHolder(ID720)).toEqual({ status: 'unknown', reason: 'esplora_disagreement' });
    expect(calls.some((c) => c.url.includes(BAD_TXID))).toBe(false);
  });

  it('(9) every Esplora request refuses redirects', async () => {
    await trackInscriptionHolder(ID720);
    const esplora = calls.filter((c) => c.url.startsWith(MEMPOOL) || c.url.startsWith(BLOCKSTREAM));
    expect(esplora.length).toBeGreaterThan(0);
    for (const c of esplora) expect(c.init?.redirect).toBe('error');
  });
});

describe('deeds', () => {
  it('(10) a height without a pin still needs the resolver: 503 while ord is down', async () => {
    expect(await gate(HOLDER720, 840001)).toBe(503);
    expect((await canonicalDeedFor(840001)).verdict).not.toBe('canonical');
  }, 30_000);

  it('(14) every ord host down: a pinned deed is canonical, from the pin, with no request', async () => {
    calls = [];
    const deed = await canonicalDeedFor(H720);
    expect(deed).toMatchObject({ verdict: 'canonical', inscriptionId: ID720, source: 'pin' });
    expect(calls).toEqual([]);
  });
});
