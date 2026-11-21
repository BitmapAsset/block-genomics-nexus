/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SIMULATION — a stream on a block is shown only while the wallet that signed
 * its latest start holds the block, and for 12 hours after that start.
 *
 * The holder is asked the way the public block page asks it: the block's deed
 * (mocked here), then that deed's holder on the display tier, named only when
 * two chain sources agree. The chain sources are mocked; the freshness cache
 * and the agreement rule are the real modules. A hidden stream answers
 * `{ live: false, ended }` and names no address, link or player.
 */

const HOLDER = 'bc1pholder0000000000000000000000000000000000000000000000000000';
const OTHER = 'bc1pother00000000000000000000000000000000000000000000000000000';
const SAT = 'a'.repeat(64) + ':0:0';
const ordOk = (addr: string) => ({ address: addr, satpoint: SAT, source: 'ordinals.com' });
const esploraOk = (addr: string) => [{ source: 'esplora:mempool.space', host: 'mempool.space', state: 'ok', address: addr, satpoint: SAT }];
const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};

const mockAfter = jest.fn();
const mockOrd = jest.fn();
const mockTrace = jest.fn();

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse, NextRequest: class {}, after: (fn: () => unknown) => mockAfter(fn) };
});

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));

jest.mock('@/lib/onchain/deed', () => ({
  canonicalDeedFor: jest.fn(async (h: number) => ({ height: h, inscriptionId: h === 612889 ? 'insc_live1' : 'insc_live0', ruleId: 'test', verdict: 'canonical', resolvedAt: '2026-11-19T00:00:00.000Z' })),
}));

jest.mock('@/lib/onchain/ord', () => ({
  ...jest.requireActual('@/lib/onchain/ord'),
  getInscriptionOwner: (...a: unknown[]) => mockOrd(...(a as [])),
}));

jest.mock('@/lib/onchain/sat-tracker', () => ({
  ...jest.requireActual('@/lib/onchain/sat-tracker'),
  isSatTrackerEnabled: () => true,
  traceEachProvider: (...a: unknown[]) => mockTrace(...(a as [])),
  forgetLocations: () => undefined,
}));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/v1/livestream/route';
import { GET as ACTIVE } from '@/app/api/v1/livestream/active/route';
import { __resetOwnerObservations } from '@/lib/onchain/owner-freshness';
import { canonicalDeedFor } from '@/lib/onchain/deed';

const db = prisma as any;
const deedMock = canonicalDeedFor as jest.Mock;

beforeEach(() => {
  jest.restoreAllMocks();
  db.__reset();
  __resetOwnerObservations();
  deedMock.mockReset().mockImplementation(async (h: number) => ({ height: h, inscriptionId: h === 612889 ? 'insc_live1' : 'insc_live0', ruleId: 'test', verdict: 'canonical', resolvedAt: '2026-11-19T00:00:00.000Z' }));
  mockAfter.mockReset();
  mockOrd.mockReset().mockResolvedValue(ordOk(HOLDER));
  mockTrace.mockReset().mockResolvedValue(esploraOk(HOLDER));
});

async function seed(startedAgoMs: number | null, owner = HOLDER, height = 612888, extra: Record<string, unknown> = {}) {
  await db.block.create({
    data: {
      height,
      streamUrl: 'https://www.twitch.tv/somechannel',
      streamType: 'broadcast',
      streamOwner: owner,
      streamStartedAt: startedAgoMs === null ? null : new Date(Date.now() - startedAgoMs),
      ...extra,
    },
  });
}

async function get(): Promise<any> {
  const res: any = await GET({ nextUrl: new URL('http://localhost/api/v1/livestream?blockHeight=612888'), headers: { get: () => null } } as never);
  return res.json();
}

async function list(): Promise<any> {
  const res: any = await ACTIVE(new Request('http://localhost/api/v1/livestream/active'));
  return res.json();
}

describe('GET /livestream', () => {
  it('V1 starter holds, seed(3_600_000)', async () => {
    await seed(3_600_000);
    const body = await get();
    expect(body.live).toBe(true);
    expect(body.embedUrl).toBe('https://player.twitch.tv/?channel=somechannel&parent=blockgenomics.io&parent=www.blockgenomics.io&autoplay=true&muted=true');
    expect(body.startedBy).toBe(HOLDER);
  });

  it('V2 another wallet holds (ordOk(OTHER), esploraOk(OTHER))', async () => {
    await seed(3_600_000);
    mockOrd.mockResolvedValue(ordOk(OTHER));
    mockTrace.mockResolvedValue(esploraOk(OTHER));
    expect(await get()).toEqual({ live: false, ended: 'holder_changed' });
  });

  it('V3 sources down (mockOrd null, mockTrace [])', async () => {
    await seed(3_600_000);
    mockOrd.mockResolvedValue(null);
    mockTrace.mockResolvedValue([]);
    expect(await get()).toEqual({ live: false, ended: 'unconfirmed' });
  });

  it('V4 sources disagree (ordOk(HOLDER), esploraOk(OTHER))', async () => {
    await seed(3_600_000);
    mockOrd.mockResolvedValue(ordOk(HOLDER));
    mockTrace.mockResolvedValue(esploraOk(OTHER));
    expect(await get()).toEqual({ live: false, ended: 'unconfirmed' });
  });

  it('V5 seed(12 * 3_600_000 + 1000)', async () => {
    await seed(12 * 3_600_000 + 1000);
    expect(await get()).toEqual({ live: false, ended: 'expired' });
    expect(mockOrd).not.toHaveBeenCalled();
  });

  it('V6 seed(12 * 3_600_000 - 60_000)', async () => {
    await seed(12 * 3_600_000 - 60_000);
    expect((await get()).live).toBe(true);
  });

  it('V7 100 GETs one after another', async () => {
    await seed(3_600_000);
    for (let i = 0; i < 100; i++) {
      expect((await get()).live).toBe(true);
    }
    expect(mockOrd).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('V8 one GET (fills the cold cache); const t0 = Date.now() read before the spy; jest.spyOn(Date, "now").mockReturnValue(t0 + 5 * 60_000 + 1000); one more GET', async () => {
    await seed(3_600_000);
    expect((await get()).live).toBe(true);
    const t0 = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(t0 + 5 * 60_000 + 1000);
    expect((await get()).live).toBe(true);
    expect(mockOrd).toHaveBeenCalledTimes(2);
  });

  it('V10 mockOrd.mockReturnValue(new Promise(() => {})), seed(3_600_000), get() timed with Date.now()', async () => {
    await seed(3_600_000);
    mockOrd.mockReturnValue(new Promise(() => {}));
    const t0 = Date.now();
    const body = await get();
    const took = Date.now() - t0;
    expect(body).toEqual({ live: false, ended: 'unconfirmed' });
    expect(took).toBeGreaterThanOrEqual(7900);
    expect(took).toBeLessThanOrEqual(9500);
    await flush();
    expect(mockAfter).toHaveBeenCalledTimes(1);
  }, 15000);

  it('V11 seed(null)', async () => {
    await seed(null);
    expect(await get()).toEqual({ live: false, ended: 'expired' });
  });

  it('V12 100 concurrent GETs on a cold cache (Promise.all)', async () => {
    await seed(3_600_000);
    await Promise.all(Array.from({ length: 100 }, () => get()));
    expect(mockOrd).toHaveBeenCalledTimes(1);
  });

  it('V15 the deed lookup throws', async () => {
    await seed(3_600_000);
    deedMock.mockRejectedValue(new Error('deed lookup failed'));
    expect(await get()).toEqual({ live: false, ended: 'unconfirmed' });
    expect(mockOrd).not.toHaveBeenCalled();
  });

  it('V16 the block has no deed (verdict none)', async () => {
    await seed(3_600_000);
    deedMock.mockResolvedValue({ height: 612888, inscriptionId: null, ruleId: 'test', verdict: 'none', resolvedAt: '2026-11-19T00:00:00.000Z' });
    expect(await get()).toEqual({ live: false, ended: 'holder_changed' });
    expect(mockOrd).not.toHaveBeenCalled();
  });

  it('V17 the deed is not settled (verdict undetermined, with an id)', async () => {
    await seed(3_600_000);
    deedMock.mockResolvedValue({ height: 612888, inscriptionId: 'insc_live0', ruleId: 'test', verdict: 'undetermined', resolvedAt: '2026-11-19T00:00:00.000Z' });
    expect(await get()).toEqual({ live: false, ended: 'unconfirmed' });
    expect(mockOrd).not.toHaveBeenCalled();
  });

  it('V18 a row with a link and no starter', async () => {
    await seed(3_600_000, null as any);
    expect(await get()).toEqual({ live: false, ended: 'holder_changed' });
    expect(deedMock).not.toHaveBeenCalled();
    expect(mockOrd).not.toHaveBeenCalled();
  });
});

describe('GET /livestream/active', () => {
  it("V9 seed(3_600_000), seed(3_600_000, HOLDER, 612889) (started by HOLDER while the chain names OTHER for that deed), seed(13 * 3_600_000, HOLDER, 612890); mockOrd and mockTrace name OTHER for insc_live1, HOLDER otherwise; list()", async () => {
    await seed(3_600_000);
    await seed(3_600_000, HOLDER, 612889);
    await seed(13 * 3_600_000, HOLDER, 612890);
    mockOrd.mockImplementation(async (id: string) => ordOk(id === 'insc_live1' ? OTHER : HOLDER));
    mockTrace.mockImplementation(async (id: string) => esploraOk(id === 'insc_live1' ? OTHER : HOLDER));
    const body = await list();
    expect(body.count).toBe(1);
    expect(body.streams[0].blockHeight).toBe(612888);
    expect(body.checking).toBe(0);
  });

  it('V13 six rows seed(3_600_000, HOLDER, 612888 + k) for k = 0..5; mockOrd waits on a gate; list() timed; then release(), await flush(), list() again', async () => {
    for (let k = 0; k <= 5; k++) await seed(3_600_000, HOLDER, 612888 + k);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    mockOrd.mockImplementation(async () => {
      await gate;
      return ordOk(HOLDER);
    });
    const t0 = Date.now();
    const first = await list();
    const took = Date.now() - t0;
    expect(took).toBeLessThan(2500);
    expect(first.streams).toEqual([]);
    expect(first.count).toBe(0);
    expect(first.checking).toBe(6);
    expect(deedMock).toHaveBeenCalledTimes(4);
    await flush();
    expect(mockAfter).toHaveBeenCalledTimes(4);

    release();
    await flush();
    const second = await list();
    expect(second.count).toBe(6);
    expect(second.checking).toBe(0);
  }, 15000);

  it("V14 seed(3_600_000, HOLDER, 612888, { ownerAddress: OTHER, label: 'Plaza One' }), seed(3_600_000, HOLDER, 612890, { ownerAddress: HOLDER, label: 'Plaza Two' }); list()", async () => {
    await seed(3_600_000, HOLDER, 612888, { ownerAddress: OTHER, label: 'Plaza One' });
    await seed(3_600_000, HOLDER, 612890, { ownerAddress: HOLDER, label: 'Plaza Two' });
    const body = await list();
    const a = body.streams.find((s: any) => s.blockHeight === 612888);
    const b = body.streams.find((s: any) => s.blockHeight === 612890);
    expect(a.label).toBeNull();
    expect(a.ownerHandle).toBeNull();
    expect(b.label).toBe('Plaza Two');
  });

  it('V19 the deed lookup throws for one of two rows; list()', async () => {
    await seed(3_600_000);
    await seed(3_600_000, HOLDER, 612889);
    deedMock.mockImplementation(async (h: number) => {
      if (h === 612889) throw new Error('deed lookup failed');
      return { height: h, inscriptionId: 'insc_live0', ruleId: 'test', verdict: 'canonical', resolvedAt: '2026-11-19T00:00:00.000Z' };
    });
    const body = await list();
    expect(body.count).toBe(1);
    expect(body.streams[0].blockHeight).toBe(612888);
    expect(body.checking).toBe(0);
  });
});
