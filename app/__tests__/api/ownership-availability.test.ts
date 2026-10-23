/**
 * An outage is never a "not owned".
 *
 * Production on 2026-10-22: ordinals.com answered every scripted request with a
 * Cloudflare 403, and `GET /api/v1/ownership/718840` returned
 * `{ onChainOwner: null, match: false }` — a false negative indistinguishable
 * from "this wallet does not hold the block". These cases drive the real
 * routes through the real ord client, owner-freshness and sat tracker, with
 * only the network and the database stood in for:
 *
 *   - every source down → `chain: 'unavailable'`, `verdict: 'unknown'`,
 *     `match: null`, and the outage start is reported;
 *   - ord host 1 blocked → host 2 answers, and `source` says which;
 *   - every ord host blocked → the Esplora sat tracker answers;
 *   - the MCP ownership tool hands those fields through unchanged.
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
}));

import fixture from '../fixtures/esplora-deed-history.json';
import prisma from '@/lib/prisma';
import { __resetOrdClientForTest } from '@/lib/onchain/ord';
import { __resetOwnerObservations, DISPLAY_TTL_MS } from '@/lib/onchain/owner-freshness';
import { __resetSatTracker } from '@/lib/onchain/sat-tracker';
import { GET as byHeight } from '@/app/api/v1/ownership/[height]/route';
import { GET as verify } from '@/app/api/v1/ownership/verify/route';
import { buildToolCatalog } from '@/lib/mcp/catalog';
import { batchVerifyOwnership, verifyAndSyncBlock } from '@/lib/ownership-sync';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const realFetch = global.fetch;

const BLOCK = 718840;
const DEED = 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0';
const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const SATPOINT = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:3:0';
const OTHER = 'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsomeoneelse';

type Upstream = 'down' | 'holder' | 'replay';
let ordA: Upstream = 'down';
let ordB: Upstream = 'down';
let esplora: Upstream = 'down';

const blockPage = () => new Response('<title>Attention Required! | Cloudflare</title>', { status: 403 });
const recorded = (fixture as { responses: Record<string, { status: number; body: unknown }> }).responses;

beforeEach(() => {
  db.__reset();
  __resetOwnerObservations();
  __resetSatTracker();
  __resetOrdClientForTest({ list: 'https://a.example,https://b.example', single: null, throttleMs: 0, backoffMs: 0 });
  ordA = 'down';
  ordB = 'down';
  esplora = 'down';
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ord = url.startsWith('https://a.example') ? ordA : url.startsWith('https://b.example') ? ordB : null;
    if (ord !== null) {
      if (ord === 'down') return blockPage();
      return new Response(JSON.stringify({ address: HOLDER, satpoint: SATPOINT }), { status: 200 });
    }
    if (url.startsWith('https://mempool.space/api') || url.startsWith('https://blockstream.info/api')) {
      if (esplora === 'down' || !url.startsWith('https://mempool.space/api')) return new Response('down', { status: 503 });
      const r = recorded[url.slice('https://mempool.space/api'.length)];
      if (!r) return new Response('not found', { status: 404 });
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
});

afterAll(() => {
  __resetOrdClientForTest();
});

async function seed(ownerAddress: string | null, inscriptionId: string | null = DEED) {
  await db.block.create({ data: { height: BLOCK, ownerAddress, inscriptionId } });
}

async function read(height = BLOCK) {
  const res: any = await byHeight(
    { nextUrl: new URL(`http://test.local/api/v1/ownership/${height}`), headers: new Headers() } as any,
    { params: Promise.resolve({ height: String(height) }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

describe('GET /api/v1/ownership/[height]', () => {
  it('every source down: unknown, never a false negative', async () => {
    await seed(HOLDER);
    const data = await read();

    expect(data).toMatchObject({
      blockHeight: BLOCK,
      dbOwner: HOLDER,
      onChainOwner: null,
      match: null,
      verdict: 'unknown',
      chain: 'unavailable',
      source: null,
      lastVerifiedAt: null,
      inscriptionId: DEED,
      action: 'none',
    });
    expect(data.match).not.toBe(false);
    expect(Date.parse(data.unavailableSince)).not.toBeNaN();
    expect(Date.parse(data.checkedAt)).not.toBeNaN();
  });

  it('ord host 1 blocked: host 2 answers and is named as the source', async () => {
    ordB = 'holder';
    await seed(HOLDER);
    expect(await read()).toMatchObject({
      onChainOwner: HOLDER,
      match: true,
      verdict: 'match',
      chain: 'ok',
      source: 'b.example',
      unavailableSince: null,
    });
  });

  it('every ord host blocked: the Esplora sat tracker answers', async () => {
    esplora = 'replay';
    await seed(HOLDER);
    expect(await read()).toMatchObject({
      onChainOwner: HOLDER,
      match: true,
      verdict: 'match',
      chain: 'ok',
      source: 'esplora:mempool.space',
    });
  });

  it('a live holder that differs from the record is a mismatch', async () => {
    ordA = 'holder';
    await seed(OTHER);
    expect(await read()).toMatchObject({ onChainOwner: HOLDER, match: false, verdict: 'mismatch', chain: 'ok', action: 'update' });
  });

  it('no inscription on file: nothing was asked', async () => {
    await seed(HOLDER, null);
    expect(await read()).toMatchObject({ chain: 'unchecked', verdict: 'unknown', match: null, source: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('an outage after a good check reports both times', async () => {
    let now = Date.parse('2026-10-22T23:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    ordA = 'holder';
    await seed(HOLDER);
    expect((await read()).chain).toBe('ok');

    ordA = 'down';
    now += DISPLAY_TTL_MS + 61_000; // past the display cache and the host cooldown
    const data = await read();
    expect(data).toMatchObject({
      chain: 'unavailable',
      verdict: 'unknown',
      match: null,
      lastVerifiedAt: '2026-10-22T23:00:00.000Z',
      unavailableSince: new Date(now).toISOString(),
    });
  });
});

describe('GET /api/v1/ownership/verify and the MCP tool', () => {
  const verifyCall = async (path: string, opts?: { query?: Record<string, unknown> }) => {
    expect(path).toBe('/api/v1/ownership/verify');
    const url = new URL(`http://test.local${path}`);
    for (const [k, v] of Object.entries(opts?.query ?? {})) url.searchParams.set(k, String(v));
    const res: any = await verify({ nextUrl: url, headers: new Headers() } as any);
    return JSON.stringify(await res.json());
  };

  it('verify carries the same availability fields', async () => {
    await seed(HOLDER);
    const body = JSON.parse(await verifyCall('/api/v1/ownership/verify', { query: { blockHeight: BLOCK } }));
    expect(body.data).toMatchObject({ chain: 'unavailable', verdict: 'unknown', match: null, source: null });
  });

  it('bg_ownership_verify returns chain, verdict and source', async () => {
    esplora = 'replay';
    await seed(HOLDER);
    const tool = buildToolCatalog(verifyCall as any).publicTools.find((t) => t.name === 'bg_ownership_verify');
    expect(tool).toBeDefined();

    const out = JSON.parse(await tool!.run({ blockHeight: BLOCK }));
    expect(out.data).toMatchObject({ chain: 'ok', verdict: 'match', source: 'esplora:mempool.space', onChainOwner: HOLDER });
  });
});

describe('a derived holder never triggers a transfer on its own', () => {
  // A transfer releases the seller's guardian, profile and links. While ord
  // hosts are unreachable the sat tracker may show and authorize a holder, but
  // the release waits for an ord host to confirm the change of hands.
  const owner = async () => (await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress;

  it('the reconciliation cron defers a mismatch the sat tracker found', async () => {
    esplora = 'replay';
    await seed(OTHER);
    const [check] = await batchVerifyOwnership([BLOCK]);
    expect(check).toMatchObject({ action: 'update', onChainOwnerAddress: HOLDER, holderSource: 'esplora:mempool.space' });
    expect(await owner()).toBe(OTHER);
    expect(await db.ownershipTransfer.count()).toBe(0);
  });

  it('the same mismatch read from an ord host is transferred', async () => {
    ordB = 'holder';
    await seed(OTHER);
    const [check] = await batchVerifyOwnership([BLOCK]);
    expect(check.holderSource).toBe('b.example');
    expect(await owner()).toBe(HOLDER);
  });

  it('verifyAndSyncBlock fails closed for the buyer until an ord host confirms', async () => {
    let now = Date.parse('2026-10-22T23:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    esplora = 'replay';
    await seed(OTHER);
    expect((await verifyAndSyncBlock(BLOCK, HOLDER)).isOwner).toBe(false);
    expect(await owner()).toBe(OTHER);

    ordA = 'holder';
    now += 61_000; // the blocked hosts' cooldown has run out
    expect((await verifyAndSyncBlock(BLOCK, HOLDER)).isOwner).toBe(true);
    expect(await owner()).toBe(HOLDER);
  });
});

describe('owner sign-in while every ord host is blocked', () => {
  // verifyBlockOwnedBy is the one ownership gate (auth/verify, the MCP write
  // gate). With ord blocked it used to answer `unavailable` for everyone.

  it('the holder verifies: holder from the sat tracker, content from the reveal tx', async () => {
    esplora = 'replay';
    expect(await verifyBlockOwnedBy(HOLDER, BLOCK, DEED)).toEqual({ verified: true, inscriptionId: DEED });
  });

  it('another wallet gets a real negative, not an outage', async () => {
    esplora = 'replay';
    expect(await verifyBlockOwnedBy(OTHER, BLOCK, DEED)).toMatchObject({ verified: false, reason: 'Inscription is not held by this wallet' });
  });

  it('a deed for another block is refused on content', async () => {
    esplora = 'replay';
    const check = await verifyBlockOwnedBy(HOLDER, 718841, DEED);
    expect(check.verified).toBe(false);
    expect(check.unavailable).toBeUndefined();
    expect(check.reason).toContain('does not match block 718841');
  });

  it('with Esplora down as well it fails closed as unavailable', async () => {
    const check = await verifyBlockOwnedBy(HOLDER, BLOCK, DEED);
    expect(check).toMatchObject({ verified: false, unavailable: true });
  });
});
