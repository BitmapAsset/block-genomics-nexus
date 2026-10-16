/**
 * `GET /api/v1/block-thumbnail/[height]` — the bitmap art PNG behind the block
 * page, BitmapThumbnail (wallet dropdown, /portfolio, /profile, /agent), the OG
 * card and the Nexus canvas.
 *
 * The route used to fetch the first 25 transactions and fill the rest of the
 * block from a height-seeded PRNG, then persist that estimate for a year. It now
 * renders every transaction from mempool's block summary, persists only a full
 * render, and refreshes rows written before the fix lazily in place.
 *
 * mempool.space is mocked throughout: the summary fixture follows mempool's
 * `TransactionStripped` (txid, fee, vsize, value, rate, flags).
 */

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/prisma', () => {
  const client = {
    blockThumbnail: {
      findUnique: (...a: unknown[]) => mockFindUnique(...(a as [])),
      create: (...a: unknown[]) => mockCreate(...(a as [])),
      update: (...a: unknown[]) => mockUpdate(...(a as [])),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

// The real renderer rasterises with node-canvas; the tests only need to know
// how many transactions it was handed.
const mockRender = jest.fn((txs: Array<{ vbytes: number }>) => Buffer.from(`png:${txs.length}`));
jest.mock('@/lib/bitmap-renderer', () => ({
  renderBitmapThumbnail: (txs: Array<{ vbytes: number }>) => mockRender(txs),
}));

jest.mock('next/server', () => {
  class NextResponse {
    public status: number;
    public headers: Record<string, string>;
    constructor(
      public body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET } from '@/app/api/v1/block-thumbnail/[height]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */

const HASH = '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5';

/** 40 txs with varied vsize, coinbase first, shaped like mempool's summary. */
const SUMMARY = Array.from({ length: 40 }, (_, i) => ({
  txid: i.toString(16).padStart(64, '0'),
  fee: i === 0 ? 0 : 1000 + i * 37,
  vsize: i === 0 ? 165 : [141, 110, 222, 380, 1250, 99, 5400, 153][i % 8] + i,
  value: 100000 + i,
  rate: i === 0 ? 0 : 3.5 + i,
  flags: 1099511648266,
}));

const PRE_FIX = new Date('2026-10-15T09:00:00Z');
// Fixed and well after THUMBNAIL_REAL_ART_SINCE, which is set to the deploy time
// at ship and so can sit minutes in the future while CI runs.
const POST_FIX = new Date('2030-01-01T00:00:00Z');
const OLD_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01]);

const okText = (t: string) => ({ ok: true, text: async () => t });
const okJson = (j: unknown) => ({ ok: true, json: async () => j });

/** mempool answers: hash, block info (tx_count) and summary. */
function mempool({ txCount = SUMMARY.length, summary = SUMMARY as unknown } = {}) {
  return jest.fn(async (url: string) => {
    if (url.includes('/api/block-height/')) return okText(HASH);
    if (url.endsWith('/summary')) return okJson(summary);
    if (url.includes(`/api/block/${HASH}`)) return okJson({ tx_count: txCount });
    throw new Error(`unexpected fetch ${url}`);
  });
}

const req = (url = 'http://localhost/api/v1/block-thumbnail/0.png') =>
  ({ url, headers: { get: () => null }, nextUrl: new URL(url) }) as any;
const call = (height: string, url?: string) =>
  GET(req(url), { params: Promise.resolve({ height }) }) as any;

const bodyText = (res: any) => Buffer.from(res.body as Uint8Array).toString();

let fetchMock: jest.Mock;

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockCreate.mockReset().mockResolvedValue({});
  mockUpdate.mockReset().mockResolvedValue({});
  mockRender.mockClear();
  fetchMock = mempool();
  global.fetch = fetchMock as any;
});

// Each test uses its own height: the route keeps a per-instance negative cache.

describe('cache miss', () => {
  it('renders every transaction from the block summary and persists it', async () => {
    const res = await call('718840.png');

    expect(res.status).toBe(200);
    expect(res.headers['X-Thumbnail-Source']).toBe('live');
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');

    // One call to the summary, no txs/0 pages.
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain(`https://mempool.space/api/v1/block/${HASH}/summary`);
    expect(urls.some((u) => u.includes('/txs/'))).toBe(false);

    // vbytes = vsize for every tx, in block order.
    const txs = mockRender.mock.calls[0][0];
    expect(txs).toHaveLength(SUMMARY.length);
    expect(txs).toEqual(SUMMARY.map((t) => ({ vbytes: t.vsize })));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ blockHeight: 718840, txCount: SUMMARY.length, epoch: 4 });
    expect(Buffer.from(data.imageData).toString()).toBe(`png:${SUMMARY.length}`);
  });

  it('uses the one-day cache after epoch 4', async () => {
    const res = await call('840001.png');
    expect(res.headers['X-Thumbnail-Source']).toBe('live');
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
  });

  it('treats a summary shorter than tx_count as a failed fetch: estimated, not persisted', async () => {
    global.fetch = mempool({ txCount: SUMMARY.length + 1 }) as any;

    const res = await call('718841.png');

    expect(res.headers['X-Thumbnail-Source']).toBe('estimated');
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('treats an empty summary as a failed fetch', async () => {
    global.fetch = mempool({ txCount: 0, summary: [] }) as any;
    const res = await call('718842.png');
    expect(res.headers['X-Thumbnail-Source']).toBe('estimated');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('treats a tx without a usable vsize as a failed fetch', async () => {
    const broken = SUMMARY.map((t, i) => (i === 7 ? { ...t, vsize: undefined } : t));
    global.fetch = mempool({ summary: broken }) as any;
    const res = await call('718843.png');
    expect(res.headers['X-Thumbnail-Source']).toBe('estimated');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts the cache-busted URL /{h}.png?v=2', async () => {
    const res = await call(
      '840000.png',
      'http://localhost/api/v1/block-thumbnail/840000.png?v=2',
    );
    expect(res.status).toBe(200);
    expect(res.headers['X-Thumbnail-Source']).toBe('live');
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { blockHeight: 840000 } });
  });
});

describe('cache hit', () => {
  it('serves a row written after the fix as-is, without calling mempool', async () => {
    mockFindUnique.mockResolvedValue({ imageData: OLD_BYTES, createdAt: POST_FIX });

    const res = await call('718844.png');

    expect(res.headers['X-Thumbnail-Source']).toBe('cache');
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(res.body).equals(Buffer.from(OLD_BYTES))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes a pre-fix row in place with a full render', async () => {
    mockFindUnique.mockResolvedValue({ imageData: OLD_BYTES, createdAt: PRE_FIX });

    const res = await call('718845.png');

    expect(res.headers['X-Thumbnail-Source']).toBe('live');
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(bodyText(res)).toBe(`png:${SUMMARY.length}`);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ blockHeight: 718845 });
    expect(arg.data.txCount).toBe(SUMMARY.length);
    expect(arg.data.createdAt).toBeInstanceOf(Date);
    expect(arg.data.createdAt.getTime()).toBeGreaterThan(PRE_FIX.getTime());
    expect(Buffer.from(arg.data.imageData).toString()).toBe(`png:${SUMMARY.length}`);
  });

  it('keeps serving a pre-fix row short-TTL when the live render fails, and backs off', async () => {
    mockFindUnique.mockResolvedValue({ imageData: OLD_BYTES, createdAt: PRE_FIX });
    const failing = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    global.fetch = failing as any;

    const res = await call('718846.png');

    expect(res.headers['X-Thumbnail-Source']).toBe('stale-estimated');
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
    expect(res.headers['Cache-Control']).not.toContain('immutable');
    expect(Buffer.from(res.body).equals(Buffer.from(OLD_BYTES))).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();

    // Within the negative window the next request does not call mempool again.
    const calls = failing.mock.calls.length;
    const again = await call('718846.png');
    expect(again.headers['X-Thumbnail-Source']).toBe('stale-estimated');
    expect(failing.mock.calls.length).toBe(calls);
  });

  it('caps in-flight re-renders: past the cap the old bytes are served short-TTL', async () => {
    mockFindUnique.mockResolvedValue({ imageData: OLD_BYTES, createdAt: PRE_FIX });

    // mempool hangs until released, so the first renders stay in flight.
    const pending: Array<() => void> = [];
    const hanging = jest.fn(
      (url: string) =>
        new Promise((resolve) => {
          pending.push(() => resolve({ ok: false, text: async () => '', url }));
        }),
    );
    global.fetch = hanging as any;

    const inFlight = [0, 1, 2, 3].map((i) => call(`${718850 + i}.png`));
    for (let i = 0; i < 20 && hanging.mock.calls.length < 4; i++) {
      await new Promise((r) => setImmediate(r));
    }
    expect(hanging).toHaveBeenCalledTimes(4);

    const capped = await call('718860.png');
    expect(capped.headers['X-Thumbnail-Source']).toBe('stale-estimated');
    expect(capped.headers['Cache-Control']).toBe('public, max-age=60');
    expect(Buffer.from(capped.body).equals(Buffer.from(OLD_BYTES))).toBe(true);
    expect(hanging).toHaveBeenCalledTimes(4); // no fifth mempool call

    pending.forEach((release) => release());
    await Promise.all(inFlight);

    // Slots are released: a new stale height renders live again.
    global.fetch = mempool() as any;
    const after = await call('718861.png');
    expect(after.headers['X-Thumbnail-Source']).toBe('live');
  });
});
