/**
 * `GET /api/v1/blocks/[height]/summary` — every transaction's vsize, fee and
 * value in block order, from the same mempool block-summary fetch the bitmap
 * thumbnail renders from. The block viewer paints its layout from this once,
 * instead of an estimate that re-shuffles when 45 paged calls finish.
 *
 * mempool.space is mocked throughout; the summary follows mempool's
 * `TransactionStripped` (txid, fee, vsize, value, rate, flags).
 */

const mockRateLimit = jest.fn();
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: (...a: unknown[]) => mockRateLimit(...a),
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

import { GET } from '@/app/api/v1/blocks/[height]/summary/route';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIP = 900_000;
const HASH = '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5';

const SUMMARY = Array.from({ length: 40 }, (_, i) => ({
  txid: i.toString(16).padStart(64, '0'),
  fee: i === 0 ? 0 : 1000 + i * 37,
  vsize: i === 0 ? 165.25 : [141, 110, 222, 380, 1250, 99, 5400, 153][i % 8] + i,
  value: 100000 + i,
  rate: i === 0 ? 0 : 3.5 + i,
  flags: 1099511648266,
}));

const okText = (t: string) => ({ ok: true, status: 200, text: async () => t });
const okJson = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
const notFound = () => ({ ok: false, status: 404, text: async () => 'Block not found' });

function mempool({
  tip = TIP as number | null,
  hashStatus = 200,
  summaryOk = true,
}: { tip?: number | null; hashStatus?: number; summaryOk?: boolean } = {}) {
  return jest.fn(async (url: string) => {
    if (url.endsWith('/api/blocks/tip/height')) {
      if (tip === null) throw new Error('tip down');
      return okText(String(tip));
    }
    if (url.includes('/api/block-height/')) {
      if (hashStatus === 404) return notFound();
      if (hashStatus !== 200) return { ok: false, status: hashStatus, text: async () => '' };
      return okText(HASH);
    }
    if (url.endsWith('/summary')) {
      if (!summaryOk) return { ok: false, status: 502, json: async () => ({}) };
      return okJson(SUMMARY);
    }
    if (url.endsWith(`/api/block/${HASH}`)) {
      return okJson({ id: HASH, tx_count: SUMMARY.length, size: 12345, weight: 40000, timestamp: 1700000000 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

const req = () => ({ url: 'http://localhost/api/v1/blocks/1/summary', headers: { get: () => null } }) as any;
const call = (height: string) => GET(req(), { params: Promise.resolve({ height }) }) as any;
const summaryCalls = (f: jest.Mock) => f.mock.calls.filter(([u]) => String(u).endsWith('/summary')).length;

let fetchMock: jest.Mock;
let now = Date.parse('2030-01-01T00:00:00Z');

beforeEach(() => {
  mockRateLimit.mockReset().mockResolvedValue({ response: null, headers: {} });
  fetchMock = mempool();
  global.fetch = fetchMock as any;
  // Each test starts past every cache window of the previous one (tip memo,
  // negative cache). Positive entries are per height, and each test uses its own.
  now += 3_600_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('shape', () => {
  it('returns every tx in block order as compact parallel arrays', async () => {
    const res = await call('612888');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      height: 612888,
      hash: HASH,
      txCount: 40,
      size: 12345,
      weight: 40000,
      timestamp: 1700000000,
      vsize: SUMMARY.map((t) => t.vsize),
      fee: SUMMARY.map((t) => t.fee),
      value: SUMMARY.map((t) => t.value),
    });
  });

  it('is rate-limited like the thumbnail', async () => {
    const limited = { status: 429, body: 'slow down' };
    mockRateLimit.mockResolvedValueOnce({ response: limited, headers: {} });
    expect(await call('612889')).toBe(limited);
    expect(mockRateLimit.mock.calls[0][1]).toEqual({ bucket: 'v1-blocks-height-summary' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed height with 400', async () => {
    expect((await call('84000x')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Cache-Control', () => {
  it('is immutable for a block with at least 6 confirmations', async () => {
    const res = await call(String(TIP - 6));
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('is max-age=60 near the tip', async () => {
    const res = await call(String(TIP - 2));
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
  });

  it('is max-age=60 when the tip is unknown', async () => {
    global.fetch = mempool({ tip: null }) as any;
    const res = await call('500000');
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
  });
});

describe('failures', () => {
  it('404s a height above the tip without asking for its hash', async () => {
    const res = await call(String(TIP + 5));
    expect(res.status).toBe(404);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/block-height/'))).toBe(false);
  });

  it('404s when mempool has no block at that height', async () => {
    global.fetch = mempool({ tip: null, hashStatus: 404 }) as any;
    const res = await call('899990');
    expect(res.status).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('503s with no fake body when mempool fails and nothing is cached', async () => {
    global.fetch = mempool({ summaryOk: false }) as any;
    const res = await call('600001');
    expect(res.status).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(Object.keys(res.body)).toEqual(['error']);
  });

  it('503s an incomplete summary (shorter than tx_count) instead of serving it', async () => {
    const f = jest.fn(async (url: string) => {
      if (url.endsWith('/summary')) return okJson(SUMMARY.slice(0, 25));
      return (mempool() as any)(url);
    });
    global.fetch = f as any;
    expect((await call('600002')).status).toBe(503);
  });

  it('caches the failure only for the negative window, then retries mempool', async () => {
    global.fetch = mempool({ summaryOk: false }) as any;
    expect((await call('600003')).status).toBe(503);

    const healthy = mempool();
    global.fetch = healthy as any;
    now += 30_000;
    expect((await call('600003')).status).toBe(503);
    expect(summaryCalls(healthy)).toBe(0);

    now += 31_000; // 61 s after the failure
    const res = await call('600003');
    expect(res.status).toBe(200);
    expect(summaryCalls(healthy)).toBe(1);
  });

  it('serves a cached copy when mempool later fails', async () => {
    expect((await call('600004')).status).toBe(200);
    const down = mempool({ summaryOk: false });
    global.fetch = down as any;
    const res = await call('600004');
    expect(res.status).toBe(200);
    expect(res.body.vsize).toHaveLength(40);
    expect(summaryCalls(down)).toBe(0);
  });
});
