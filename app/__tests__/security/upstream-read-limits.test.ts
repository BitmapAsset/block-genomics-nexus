/**
 * Picture and deed reads from upstream hosts refuse redirects and cap their size.
 *
 * - lib/block-summary and lib/block-txs call every upstream with
 *   `redirect: 'error'` and read each body through a byte cap (block hash and
 *   tip 128 B, block info 64 KB, mempool summary 8 MB, blockstream txs page
 *   16 MB). A body over its cap is a failed read: the summary falls back to the
 *   paged walk, a page fails the walk.
 * - The deed resolver's fetch adds the configured private ord host's
 *   Authorization only to requests for that host, and those requests never
 *   follow a redirect. Requests to any other host are passed through as before.
 * - The capped reader lives in lib/capped-read and is shared with lib/onchain/ord
 *   (its own cap tests are in __tests__/lib/ord-content-cap.test.ts).
 */

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memoryRateLimiter } = require('../helpers/rate-limit-memory');
  const limiter = memoryRateLimiter();
  const client = {
    $queryRaw: limiter.$queryRaw,
    deedVerdict: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})) },
    __limiter: limiter,
  };
  return { __esModule: true, default: client, prisma: client };
});

import { getBlockSummary, getTipHeight } from '@/lib/block-summary';
import { fetchEsploraBlockTxs } from '@/lib/block-txs';
import { deedResolverOptions } from '@/lib/onchain/deed';
import { __resetOrdClientForTest } from '@/lib/onchain/ord';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BS = 'https://blockstream.info/api';
const MB = 1024 * 1024;
const hashOf = (h: number) => h.toString(16).padStart(64, '0');
const TXS = [
  { vsize: 150, fee: 0, value: 625_000_000 },
  { vsize: 200, fee: 500, value: 120_000 },
];

function res(status: number, body = '', headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: null,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

/** Both hosts serving one healthy block; `override` swaps single answers. */
function hosts(height: number, override: (url: string) => ReturnType<typeof res> | null = () => null) {
  const calls: Array<{ url: string; init?: any }> = [];
  const hash = hashOf(height);
  const f = jest.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    const swapped = override(url);
    if (swapped) return swapped;
    if (url.endsWith('/blocks/tip/height')) return res(200, '980000');
    if (url.endsWith(`/block-height/${height}`)) return res(200, hash);
    if (url.endsWith(`/v1/block/${hash}/summary`)) return res(200, JSON.stringify(TXS));
    if (url.endsWith(`/block/${hash}`)) return res(200, JSON.stringify({ tx_count: TXS.length, size: 1, weight: 4, timestamp: 1 }));
    if (url.endsWith(`/block/${hash}/txs/0`)) {
      return res(200, JSON.stringify(TXS.map((t) => ({ weight: t.vsize * 4, fee: t.fee, vout: [{ value: t.value }] }))));
    }
    throw new Error(`unexpected ${url}`);
  });
  return { f, calls };
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('picture reads refuse redirects', () => {
  it('every mempool.space call of a summary and the tip read pass redirect: error', async () => {
    const h = hosts(700_701);
    global.fetch = h.f as any;
    await getBlockSummary(700_701);
    await getTipHeight();
    expect(h.calls.length).toBeGreaterThanOrEqual(3);
    for (const c of h.calls) expect([c.url, c.init?.redirect]).toEqual([c.url, 'error']);
  });

  it('every blockstream.info call of the paged walk passes redirect: error', async () => {
    const h = hosts(700_702);
    global.fetch = h.f as any;
    await fetchEsploraBlockTxs(BS, 700_702);
    expect(h.calls.length).toBe(3);
    for (const c of h.calls) expect([c.url, c.init?.redirect]).toEqual([c.url, 'error']);
  });
});

describe('picture reads cap their size', () => {
  it('a 9 MB mempool summary is refused and the paged walk answers instead', async () => {
    const hash = hashOf(700_801);
    const big = JSON.stringify(TXS);
    const h = hosts(700_801, (url) =>
      url === `https://mempool.space/api/v1/block/${hash}/summary` ? res(200, big, { 'content-length': String(9 * MB) }) : null,
    );
    global.fetch = h.f as any;
    const s = await getBlockSummary(700_801);
    expect(s.hash).toBe(hash);
    expect(h.calls.some((c) => c.url.startsWith(BS))).toBe(true);
  });

  it('a blockstream page over 16 MB fails the walk', async () => {
    const hash = hashOf(700_802);
    const h = hosts(700_802, (url) =>
      url.endsWith(`/block/${hash}/txs/0`) ? res(200, '[]', { 'content-length': String(17 * MB) }) : null,
    );
    global.fetch = h.f as any;
    await expect(fetchEsploraBlockTxs(BS, 700_802)).rejects.toThrow('over the size cap');
    // Under the cap the same body would be read and fail as a short page instead.
    const under = hosts(700_803, (url) => (url.endsWith(`/block/${hashOf(700_803)}/txs/0`) ? res(200, '[]') : null));
    global.fetch = under.f as any;
    await expect(fetchEsploraBlockTxs(BS, 700_803)).rejects.toThrow('Short txs page 0');
  });

  it('a block hash answer over 128 bytes is not read', async () => {
    const h = hosts(700_804, (url) =>
      url === 'https://mempool.space/api/block-height/700804' ? res(200, hashOf(700_804), { 'content-length': '4096' }) : null,
    );
    global.fetch = h.f as any;
    // mempool's hash is refused, so the walk answers (its own hash read is normal).
    const s = await getBlockSummary(700_804);
    expect(s.hash).toBe(hashOf(700_804));
    expect(h.calls.some((c) => c.url.startsWith(BS))).toBe(true);
  });
});

describe('the shared capped reader', () => {
  it('lib/capped-read returns the text under the cap and null over it', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readCappedText } = require('@/lib/capped-read');
    expect(await readCappedText(res(200, 'abc'), 3)).toBe('abc');
    expect(await readCappedText(res(200, 'abcd'), 3)).toBeNull();
    expect(await readCappedText(res(200, 'abc', { 'content-length': '10' }), 3)).toBeNull();
  });
});

describe('the deed resolver fetch', () => {
  // Built from parts: a fixture, not a credential.
  const ORD_WITH_LOGIN = 'https://' + 'u' + ':' + 'x'.repeat(8) + '@ord.example';

  beforeEach(() => __resetOrdClientForTest({ list: ORD_WITH_LOGIN, single: null }));
  afterAll(() => __resetOrdClientForTest({ list: null, single: null }));

  it('to the configured ord host: carries the Authorization and refuses redirects', async () => {
    const seen: any[] = [];
    global.fetch = jest.fn(async (_url: string, init?: any) => {
      seen.push(init);
      return res(200, '{}');
    }) as any;
    await deedResolverOptions().fetch('https://ord.example/r/blockheight', { headers: { Accept: 'application/json' } });
    const headers = new Headers(seen[0].headers);
    expect(headers.get('Authorization')).toMatch(/^Basic /);
    expect(headers.get('Accept')).toBe('application/json');
    expect(seen[0].redirect).toBe('error');
  });

  it('to an Esplora host: no Authorization and the redirect mode is left as given', async () => {
    const seen: any[] = [];
    global.fetch = jest.fn(async (_url: string, init?: any) => {
      seen.push(init);
      return res(200, '{}');
    }) as any;
    await deedResolverOptions().fetch(`${BS}/blocks/tip/height`, { redirect: 'follow' });
    const headers = new Headers(seen[0].headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(seen[0].redirect).toBe('follow');
  });
});
