/**
 * lib/block-txs (paged Esplora walk) and its use as lib/block-summary's
 * fallback: when mempool's one-call summary cannot be had, the block is read
 * 25 transactions per page from blockstream.info, never guessed. The layout it
 * yields must be the same canonical layout the summary gives.
 *
 * The Esplora answers are built from the research fixture (block 612,888,
 * paged walk: weight, fee, sum of vout per tx).
 */

// getBlockSummary charges its upstream reads to a shared budget; the real
// limiter runs over an in-memory counter so the fallback cases have budget.
jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memoryRateLimiter } = require('../helpers/rate-limit-memory');
  const client = { $queryRaw: memoryRateLimiter().$queryRaw };
  return { __esModule: true, default: client, prisma: client };
});

import fs from 'fs';
import path from 'path';
import { EsploraBlockNotFound, fetchEsploraBlockTxs } from '@/lib/block-txs';
import { BlockNotFoundError, getBlockSummary } from '@/lib/block-summary';
import { completeSatTotals, layoutBlock } from '@/lib/bitmap-layout';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIXTURES = path.join(__dirname, '..', '..', '__fixtures__');
const TXS = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'block-612888-txs.json'), 'utf8')) as {
  weight: number;
  fee: number;
  out: number;
}[];
const SUMMARY = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'block-612888-summary.json'), 'utf8')) as {
  hash: string;
  vsize: number[];
  value: number[];
};
const HASH = SUMMARY.hash;
const BS = 'https://blockstream.info/api';

const okText = (t: string) => ({ ok: true, status: 200, text: async () => t });
// text() too: bodies are read through a size cap, which reads text.
const okJson = (j: unknown) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });

/** An Esplora host serving block 612,888; tracks pages in flight. */
function esplora(host: string, { txs = TXS, shortPage = -1, hashStatus = 200 } = {}) {
  let inFlight = 0;
  const stats = { maxInFlight: 0, pages: 0 };
  const f = jest.fn(async (url: string) => {
    if (!url.startsWith(host)) throw new Error(`unreachable ${url}`);
    if (url.includes('/block-height/')) {
      return hashStatus === 200 ? okText(HASH) : { ok: false, status: hashStatus, text: async () => '' };
    }
    const m = /\/block\/[0-9a-f]{64}\/txs\/(\d+)$/.exec(url);
    if (m) {
      inFlight++;
      stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      stats.pages++;
      const start = Number(m[1]);
      let page = txs.slice(start, start + 25).map((t) => ({ weight: t.weight, fee: t.fee, vout: [{ value: t.out }] }));
      if (start / 25 === shortPage) page = page.slice(1);
      return okJson(page);
    }
    if (url.endsWith(`/block/${HASH}`)) {
      return okJson({ id: HASH, tx_count: txs.length, size: 400950, weight: 1211757, timestamp: 1579031654 });
    }
    throw new Error(`unexpected ${url}`);
  });
  return { f, stats };
}

afterEach(() => jest.restoreAllMocks());

describe('fetchEsploraBlockTxs', () => {
  it('reads every page (4 in flight) into the summary shape, output totals included', async () => {
    const { f, stats } = esplora(BS);
    global.fetch = f as any;
    const b = await fetchEsploraBlockTxs(BS, 612888);
    expect(b.hash).toBe(HASH);
    expect(b.txCount).toBe(1114);
    expect(stats.pages).toBe(45);
    expect(stats.maxInFlight).toBeLessThanOrEqual(4);
    expect(b.value).toEqual(SUMMARY.value);
    expect(b.vsize).toEqual(TXS.map((t) => t.weight / 4));
    expect(b.vsize).toEqual(SUMMARY.vsize);
  });

  it('fails on a short page rather than returning a partial block', async () => {
    global.fetch = esplora(BS, { shortPage: 7 }).f as any;
    await expect(fetchEsploraBlockTxs(BS, 612888)).rejects.toThrow('Short txs page 7');
  });

  it('stops other workers taking pages after one page fails', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const pages: number[] = [];
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/block-height/')) return okText(HASH);
      const match = /\/txs\/(\d+)$/.exec(url);
      if (!match) return okJson({tx_count: 250});
      const start = Number(match[1]);
      pages.push(start);
      if (start === 0) return {ok: false, status: 503};
      await pending;
      return okJson(Array.from({length: 25}, () => ({weight: 800, vout: [{value: 1}]})));
    }) as any;
    await expect(fetchEsploraBlockTxs(BS, 612888)).rejects.toThrow('Failed to fetch txs page 0');
    release();
    // Drain already-in-flight workers; none may claim a fifth page.
    await new Promise(resolve => setImmediate(resolve));
    expect(pages).toEqual([0, 25, 50, 75]);
  });

  it('fails on a tx without outputs', async () => {
    const f = jest.fn(async (url: string) => {
      if (url.includes('/block-height/')) return okText(HASH);
      if (url.endsWith('/txs/0')) return okJson([{ weight: 800, fee: 0 }]);
      return okJson({ tx_count: 1 });
    });
    global.fetch = f as any;
    await expect(fetchEsploraBlockTxs(BS, 1)).rejects.toThrow('without outputs');
  });

  it('says not found on a 404 for the height', async () => {
    global.fetch = esplora(BS, { hashStatus: 404 }).f as any;
    await expect(fetchEsploraBlockTxs(BS, 999_999_999)).rejects.toBeInstanceOf(EsploraBlockNotFound);
  });

  it('gives up past its budget', async () => {
    global.fetch = esplora(BS).f as any;
    let t = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => (t += 2_000));
    await expect(fetchEsploraBlockTxs(BS, 612888, { budgetMs: 5_000 })).rejects.toThrow('over budget');
  });
});

describe('getBlockSummary falls back to blockstream.info when mempool is unreachable', () => {
  it('returns the same block, so the canonical layout is unchanged', async () => {
    const bs = esplora(BS);
    global.fetch = jest.fn(async (url: string) => {
      if (new URL(url).hostname === 'mempool.space') throw new Error('connect timeout');
      return bs.f(url);
    }) as any;
    const s = await getBlockSummary(612888);
    expect(s).toMatchObject({ height: 612888, hash: HASH, txCount: 1114 });
    expect(s.value).toEqual(SUMMARY.value);
    expect(layoutBlock(completeSatTotals(s.value)!)).toEqual(layoutBlock(SUMMARY.value));
  });

  it('does not ask blockstream about a height mempool says is unmined', async () => {
    const f = jest.fn(async (url: string) => {
      if (url.includes('mempool.space/api/block-height/')) return { ok: false, status: 404, text: async () => '' };
      throw new Error(`unexpected ${url}`);
    });
    global.fetch = f as any;
    await expect(getBlockSummary(990_001)).rejects.toBeInstanceOf(BlockNotFoundError);
    expect(f.mock.calls.some(([u]) => String(u).includes('blockstream'))).toBe(false);
  });

  it('reports not-found when mempool is down and blockstream has no such block', async () => {
    const bs = esplora(BS, { hashStatus: 404 });
    global.fetch = jest.fn(async (url: string) => {
      if (new URL(url).hostname === 'mempool.space') throw new Error('connect timeout');
      return bs.f(url);
    }) as any;
    await expect(getBlockSummary(990_002)).rejects.toBeInstanceOf(BlockNotFoundError);
  });

  it("keeps mempool's error when both hosts fail", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (new URL(url).hostname === 'mempool.space') throw new Error('connect timeout');
      return { ok: false, status: 503, text: async () => '' };
    }) as any;
    await expect(getBlockSummary(612_890)).rejects.toThrow('connect timeout');
  });
});
