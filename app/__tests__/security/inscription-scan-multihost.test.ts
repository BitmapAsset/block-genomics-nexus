/**
 * REVIEW-bg88 item 13: "Route app/src/lib/inscription-scan.ts through
 * getInscriptionContent. Update docs/WALLET-INTEGRATION.md:113 to describe
 * ORD_BASE_URLS."
 *
 * The wallet scan listed holdings through the multi-host ord client but read
 * every inscription's content from https://ordinals.com/content directly. While
 * ordinals.com answers 403 the scan failed even with a working ord host in
 * ORD_BASE_URLS. Content now comes from the same host list, and an outage on
 * every host is an honest `chain: unavailable` 503, never a raw upstream 403.
 */

const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OUTPOINT = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:0';
const ID = 'cd031d57i0';

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
  }
  return { NextResponse };
});
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));

import { __resetOrdClientForTest } from '@/lib/onchain/ord';
import { scanAddressForBitmaps } from '@/lib/inscription-scan';
import { GET } from '@/app/api/v1/inscriptions/scan/route';

const res = (status: number, body: unknown = ''): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

/** Hosts that answer 403 to everything, like ordinals.com from a blocked egress. */
let blocked: string[] = [];
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  blocked = ['https://ordinals.com', 'https://ord-a.example'];
  __resetOrdClientForTest({ list: 'https://ord-a.example,https://ord-b.example', single: null, throttleMs: 0, backoffMs: 0 });
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/address/') && url.endsWith('/utxo')) {
      const [txid, vout] = OUTPOINT.split(':');
      return res(200, [{ txid, vout: Number(vout) }]);
    }
    if (blocked.some((h) => url.startsWith(h))) return res(403, 'Forbidden');
    if (url.includes('/r/utxo/')) return res(200, { inscriptions: [ID], runes: {}, value: 546 });
    if (url.includes('/content/')) return res(200, '718840.bitmap');
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
});

afterAll(() => __resetOrdClientForTest());

it('reads content through ORD_BASE_URLS: host A 403, host B answers', async () => {
  const scan = await scanAddressForBitmaps(HOLDER);
  expect(scan).toEqual({
    ok: true,
    inscriptions: [{ type: 'block', height: 718840, inscriptionId: ID, label: '718,840.bitmap' }],
  });
  expect(calls.some((u) => u.startsWith('https://ord-b.example/content/'))).toBe(true);
  expect(calls.some((u) => u.startsWith('https://ordinals.com/'))).toBe(false);
});

it('every ord host refusing content is content_unavailable, not a smaller wallet', async () => {
  blocked.push('https://ord-b.example/content/');
  await expect(scanAddressForBitmaps(HOLDER)).resolves.toEqual({ ok: false, reason: 'content_unavailable' });
});

it('the route answers an honest chain: unavailable 503, never the upstream 403', async () => {
  blocked.push('https://ord-b.example');
  const r = (await GET({ nextUrl: { searchParams: new URLSearchParams({ address: HOLDER }) } } as never)) as unknown as {
    status: number;
    body: { success: boolean; code: string; chain: string; error: string };
    headers: Map<string, string>;
  };
  expect(r.status).toBe(503);
  expect(r.body).toMatchObject({ success: false, code: 'onchain_unavailable', chain: 'unavailable' });
  expect(r.body.error).not.toMatch(/403|forbidden/i);
  expect(r.headers.get('Retry-After')).toBe('15');
});
