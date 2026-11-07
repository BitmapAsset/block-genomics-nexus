/**
 * `GET /api/v1/blocks/[height]/layout` — the block's canonical Bitmap layout
 * (value-sized squares, Mondrian packing), built from the same cached mempool
 * block summary as `/summary` and the thumbnail. Never an estimate: a missing
 * summary or output total is `503 unavailable`.
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

// The real summary read, with each call's height and max age recorded.
const mockSummaryReads: unknown[][] = [];
jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return {
    ...actual,
    getBlockSummary: (...a: unknown[]) => {
      mockSummaryReads.push(a);
      return actual.getBlockSummary(...a);
    },
  };
});

import fs from 'fs';
import path from 'path';
import { GET } from '@/app/api/v1/blocks/[height]/layout/route';
import { __resetTipMemoForTest, KNOWN_MINED_HEIGHT } from '@/lib/block-summary';
import { MondrianLayout } from '@/lib/vendor/ordpool/mondrian-layout';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A tip above KNOWN_MINED_HEIGHT, as the real chain's is: every height at or
// below KNOWN_MINED_HEIGHT - 6 is settled whatever the tip says.
const TIP = KNOWN_MINED_HEIGHT + 8_000;
const HASH = '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5';

/** Block 612,888's recorded summary, re-shaped as mempool's TransactionStripped list. */
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as { vsize: number[]; fee: number[]; value: number[] };
const SUMMARY = FIXTURE.vsize.map((vsize, i) => ({
  txid: i.toString(16).padStart(64, '0'),
  fee: FIXTURE.fee[i],
  vsize,
  value: FIXTURE.value[i],
  rate: 1,
  flags: 1,
}));

const okText = (t: string) => ({ ok: true, status: 200, text: async () => t });
// text() too: bodies are read through a size cap, which reads text.
const okJson = (j: unknown) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });

function mempool({ summary = SUMMARY as unknown, summaryOk = true, hashStatus = 200, tipUp = true } = {}) {
  return jest.fn(async (url: string) => {
    if (url.endsWith('/api/blocks/tip/height')) {
      if (!tipUp) throw new Error('tip down');
      return okText(String(TIP));
    }
    if (url.includes('/api/block-height/')) {
      if (hashStatus === 404) return { ok: false, status: 404, text: async () => 'Block not found' };
      return okText(HASH);
    }
    if (url.endsWith('/summary')) {
      if (!summaryOk) return { ok: false, status: 502, json: async () => ({}) };
      return okJson(summary);
    }
    if (url.endsWith(`/api/block/${HASH}`)) {
      return okJson({ id: HASH, tx_count: SUMMARY.length, size: 400950, weight: 1211757, timestamp: 1579031654 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

const req = () => ({ url: 'http://localhost/api/v1/blocks/1/layout', headers: { get: () => null } }) as any;
const call = (height: string) => GET(req(), { params: Promise.resolve({ height }) }) as any;

let now = Date.parse('2031-01-01T00:00:00Z');

beforeEach(() => {
  __resetTipMemoForTest();
  mockSummaryReads.length = 0;
  mockRateLimit.mockReset().mockResolvedValue({ response: null, headers: {} });
  global.fetch = mempool() as any;
  now += 3_600_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('the canonical layout', () => {
  it("is the oracle's packing of the value sizes, in tx order, with the coinbase 5 × 5 at the top-left", async () => {
    const res = await call('612888');
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');

    const sizes = FIXTURE.value.map((v) => Math.max(1, Math.ceil(Math.log10(Math.max(1, v))) - 5));
    const oracle = new MondrianLayout(sizes);
    expect(res.body).toEqual({
      height: 612888,
      txCount: 1114,
      gridLength: oracle.length,
      gridWidth: oracle.width,
      gridHeight: oracle.height,
      sizes,
      squares: oracle.slots.map((s) => [s.position.x, s.position.y, s.size]),
      source: 'live',
    });
    expect(res.body.squares[0]).toEqual([0, 0, 5]);
  });

  it('is rate-limited in its own bucket', async () => {
    const limited = { status: 429, body: 'slow down' };
    mockRateLimit.mockResolvedValueOnce({ response: limited, headers: {} });
    expect(await call('612889')).toBe(limited);
    expect(mockRateLimit.mock.calls[0][1]).toEqual({ bucket: 'v1-blocks-height-layout' });
  });

  it('is max-age=60 near the tip', async () => {
    const res = await call(String(TIP - 2));
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
  });
});

describe('while the tip cannot be read', () => {
  it.each([KNOWN_MINED_HEIGHT - 6, 700_000])('height %i is settled: the long cache, and any cached summary', async (height) => {
    global.fetch = mempool({ tipUp: false }) as any;
    const res = await call(String(height));
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(mockSummaryReads).toEqual([[height, Infinity]]);
  });

  it('a height within 6 of KNOWN_MINED_HEIGHT keeps the short cache and a one-minute summary', async () => {
    global.fetch = mempool({ tipUp: false }) as any;
    const res = await call(String(KNOWN_MINED_HEIGHT - 3));
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
    expect(mockSummaryReads).toEqual([[KNOWN_MINED_HEIGHT - 3, 60_000]]);
  });
});

describe('never an estimate', () => {
  it('rejects a malformed height with 400', async () => {
    expect((await call('6128x8')).status).toBe(400);
  });

  it('404s above the tip', async () => {
    expect((await call(String(TIP + 1))).status).toBe(404);
  });

  it('404s when mempool has no block at that height', async () => {
    global.fetch = mempool({ hashStatus: 404 }) as any;
    const res = await call('899991');
    expect(res.status).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('503s `unavailable` when the summary fails', async () => {
    global.fetch = mempool({ summaryOk: false }) as any;
    const res = await call('600011');
    expect(res.status).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toEqual({ height: 600011, source: 'unavailable', error: 'Block layout unavailable' });
  });

  it('503s `unavailable` when one output total is missing, rather than guessing it', async () => {
    const broken = SUMMARY.map((t, i) => (i === 500 ? { ...t, value: undefined } : t));
    global.fetch = mempool({ summary: broken }) as any;
    const res = await call('600012');
    expect(res.status).toBe(503);
    expect(res.body.source).toBe('unavailable');
    expect(res.body.squares).toBeUndefined();
  });
});
