/**
 * `GET /api/v1/health/chain`: per-source reachability for humans and the
 * post-deploy smoke probe. Always 200 with the state in the body, `no-store`,
 * and no credentials from a configured ord URL anywhere in it.
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

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

import { __resetOrdClientForTest } from '@/lib/onchain/ord';
import { __resetChainHealthMemo } from '@/lib/onchain/chain-health';
import { GET } from '@/app/api/v1/health/chain/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const realFetch = global.fetch;
let ord: 'up' | 'blocked' = 'up';
let esplora: 'up' | 'down' = 'up';

const STATUS_HTML = '<dl><dt>chain</dt><dd>mainnet</dd><dt>version</dt><dd>0.29.1</dd></dl>';

beforeEach(() => {
  __resetChainHealthMemo();
  __resetOrdClientForTest({ list: 'https://user:s3cret@ord.example,https://b.example', single: null, throttleMs: 0, backoffMs: 0 });
  ord = 'up';
  esplora = 'up';
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://ord.example') || url.startsWith('https://b.example')) {
      if (ord === 'blocked') return new Response('<title>Attention Required!</title>', { status: 403 });
      if (url.endsWith('/r/blockheight')) return new Response('972672', { status: 200 });
      if (url.endsWith('/status')) return new Response(STATUS_HTML, { status: 200 });
    }
    if (url.endsWith('/blocks/tip/height')) {
      return esplora === 'up' ? new Response('972672', { status: 200 }) : new Response('down', { status: 503 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
});

afterAll(() => {
  __resetOrdClientForTest();
});

async function health() {
  const res: any = await GET({ nextUrl: new URL('http://test.local/api/v1/health/chain'), headers: new Headers() } as any);
  return res;
}

it('reports every host with status, latency, tip and version', async () => {
  const res = await health();
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('no-store');

  const data = (await res.json()).data;
  expect(data).toMatchObject({
    chain: 'ok',
    ord: { ok: true, tip: 972672, version: '0.29.1' },
    esplora: { ok: true },
    satTracker: { enabled: true },
  });
  expect(data.ord.hosts.map((h: any) => h.host)).toEqual(['ord.example', 'b.example']);
  for (const h of data.ord.hosts) {
    expect(h).toMatchObject({ ok: true, status: 200, error: null, tip: 972672 });
    expect(typeof h.latencyMs).toBe('number');
  }
  expect(data.esplora.providers.map((p: any) => p.host)).toEqual(['mempool.space', 'blockstream.info']);
  expect(Date.parse(data.checkedAt)).not.toBeNaN();
});

it('ord blocked but Esplora up: degraded, with the 403 per host', async () => {
  ord = 'blocked';
  const data = (await (await health()).json()).data;
  expect(data.chain).toBe('degraded');
  expect(data.ord).toMatchObject({ ok: false, tip: null, version: null });
  expect(data.ord.hosts[0]).toMatchObject({ host: 'ord.example', ok: false, status: 403, error: 'http_403' });
});

it('nothing reachable: unavailable, still a 200', async () => {
  ord = 'blocked';
  esplora = 'down';
  const res = await health();
  expect(res.status).toBe(200);
  expect((await res.json()).data.chain).toBe('unavailable');
});

it('never echoes credentials from a configured ord URL', async () => {
  const body = JSON.stringify(await (await health()).json());
  expect(body).not.toContain('s3cret');
  expect(body).not.toContain('user:');
});
