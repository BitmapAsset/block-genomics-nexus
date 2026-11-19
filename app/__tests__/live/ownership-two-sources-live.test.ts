/**
 * test:live — the two-source holder answer against the real Esplora hosts.
 *
 * Skipped unless BG_LIVE_TESTS=1. For 720,143 and 612,888 (two of the 18 pinned
 * deeds): the deed comes from the pin with no request; the public answer's
 * JSON; requests per host and milliseconds for a cold check and for a repeat
 * check; the live holder and satpoint compared with the recorded vector
 * (packages/bitmap-resolver/test/vectors/heights/<h>.json, read only), printed
 * as `equal` or `moved since the recording` (a move is recorded, not a
 * failure). Read-only GETs to the hosts the server already uses; about 50
 * requests in all. The database is in memory, seeded with each block's owner
 * as production shows it.
 */

import fs from 'fs';
import path from 'path';

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
}));

import prisma from '@/lib/prisma';
import { canonicalDeedFor } from '@/lib/onchain/deed';
import { __resetOwnerObservations, resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { GET as byHeight } from '@/app/api/v1/ownership/[height]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const live = process.env.BG_LIVE_TESTS === '1';
const VECTORS = path.join(__dirname, '../../../packages/bitmap-resolver/test/vectors/heights');

const BLOCKS: [number, string][] = [
  [720143, 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978'],
  [612888, 'bc1p4cdhx2hkq9kutw0wvnn77ekevrm2ga9pfmq4td426js5vyhrexys80ewp6'],
];

const realFetch = global.fetch;
let perHost: Record<string, number> = {};

function counting() {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const host = new URL(url).host;
    perHost[host] = (perHost[host] ?? 0) + 1;
    return realFetch(input, init);
  }) as typeof fetch;
}

async function read(height: number) {
  const res: any = await byHeight(
    { nextUrl: new URL(`http://live.local/api/v1/ownership/${height}`), headers: new Headers() } as any,
    { params: Promise.resolve({ height: String(height) }) },
  );
  return (await res.json()).data;
}

(live ? describe : describe.skip)('test:live two sources', () => {
  const report: Record<string, unknown> = {};

  beforeAll(() => counting());
  afterAll(() => {
    global.fetch = realFetch;
    const text = JSON.stringify(report, null, 2);
    if (process.env.BG_PROOF4_OUT) fs.writeFileSync(process.env.BG_PROOF4_OUT, text);
    console.log(text);
  });

  it.each(BLOCKS)('%s', async (height, dbOwner) => {
    await db.block.create({ data: { height, ownerAddress: dbOwner } });
    const vector = JSON.parse(fs.readFileSync(path.join(VECTORS, `${height}.json`), 'utf8'));

    perHost = {};
    const deed = await canonicalDeedFor(height);
    const deedRequests = { ...perHost };
    expect(deed).toMatchObject({ verdict: 'canonical', source: 'pin', inscriptionId: vector.expected.canonicalId });
    expect(deedRequests).toEqual({});

    perHost = {};
    let t0 = Date.now();
    const cold = await read(height);
    const coldMs = Date.now() - t0;
    const coldRequests = { ...perHost };
    // The stored display observation of that check (no request): its satpoint.
    const observed = await resolveInscriptionOwner(deed.inscriptionId as string, 'display');

    __resetOwnerObservations(); // a new check; the tracker keeps its locations
    perHost = {};
    t0 = Date.now();
    const repeat = await read(height);
    const repeatMs = Date.now() - t0;
    const repeatRequests = { ...perHost };

    const holderVerdict =
      cold.chain === 'ok' && observed?.address === vector.expected.holder && observed?.satpoint === vector.expected.satpoint
        ? 'equal'
        : 'moved since the recording';
    report[String(height)] = {
      deed: { verdict: deed.verdict, source: deed.source, inscriptionId: deed.inscriptionId, requests: deedRequests },
      cold: { ms: coldMs, requests: coldRequests, answer: cold },
      repeat: { ms: repeatMs, requests: repeatRequests, answer: repeat },
      live: { holder: observed?.address ?? null, satpoint: observed?.satpoint ?? null },
      vector: { holder: vector.expected.holder, satpoint: vector.expected.satpoint },
      holder: holderVerdict,
    };
    expect(cold.chain).toBe('ok');
  }, 90_000);
});
