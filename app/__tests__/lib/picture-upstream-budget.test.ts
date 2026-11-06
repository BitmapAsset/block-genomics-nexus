/**
 * Block pictures and their upstream reads: one shared budget across instances,
 * one fetch per height, a ceiling on the paged walk, and a cold render gated
 * like a stale one.
 *
 * - getBlockSummary: concurrent callers for one height share one fetch; a
 *   mempool summary is charged to a global budget (60 a minute) and the paged
 *   blockstream walk to its own (6 a minute). The summary budget fails open on
 *   a limiter error, the walk budget fails closed. A budget refusal is not a
 *   failure: it is never negative-cached.
 * - fetchEsploraBlockTxs: at most 240 pages (6,000 txs); the first failed page
 *   aborts every page still in flight.
 * - getBlockThumbnail: a cold render past the per-server cap serves the
 *   estimate (not negative-cached); a render is stored only once the block has
 *   six confirmations; both negative caches are bounded.
 * - fetchBlockOgSummary: its two mempool calls share their own global budget,
 *   refuse redirects, and a height this server already read is not asked again.
 *
 * The limiter is the real `rateLimitDurable` over an in-memory `$queryRaw`
 * (helpers/rate-limit-memory); mempool.space and blockstream.info are mocked.
 */

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memoryRateLimiter } = require('../helpers/rate-limit-memory');
  const limiter = memoryRateLimiter();
  const client = {
    $queryRaw: limiter.$queryRaw,
    blockThumbnail: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    __limiter: limiter,
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/bitmap-renderer', () => ({
  renderBitmapThumbnail: (sizes: number[]) => Buffer.from(`png:${sizes.length}`),
}));

import prisma from '@/lib/prisma';
import * as blockSummary from '@/lib/block-summary';
import * as blockThumbnail from '@/lib/block-thumbnail';
import { getBlockSummary } from '@/lib/block-summary';
import { fetchEsploraBlockTxs } from '@/lib/block-txs';
import { getBlockThumbnail } from '@/lib/block-thumbnail';
import { fetchBlockOgSummary } from '@/lib/blockOgData';
import type { MemoryRateLimiter } from '../helpers/rate-limit-memory';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const limiter: MemoryRateLimiter = db.__limiter;

const MEMPOOL_BUDGET = 'upstream:mempool-summary:global';
const WALK_BUDGET = 'upstream:blockstream-walk:global';
const OG_BUDGET = 'upstream:mempool-og:global';
const BS = 'https://blockstream.info/api';
const SHORT = 'public, max-age=60';

const hashOf = (h: number) => h.toString(16).padStart(64, '0');
const heightOfHash = (hash: string) => parseInt(hash, 16);

const SUMMARY = [
  { vsize: 150, fee: 0, value: 625_000_000 },
  { vsize: 200, fee: 500, value: 120_000 },
  { vsize: 300, fee: 700, value: 3_400_000 },
];

/** A fetch Response stand-in: no stream, so a capped read falls back to text(). */
function res(status: number, body = '', headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: new Headers(headers),
    body: null,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

type MempoolMode = 'ok' | 'fail500' | 'throw' | 'hang';

interface UpstreamOpts {
  mempool?: MempoolMode | ((height: number) => MempoolMode);
  blockstream?: 'ok' | 'fail';
  tip?: number | null;
}

/** mempool.space + blockstream.info, recording every call. */
function upstream(opts: UpstreamOpts = {}) {
  const calls: Array<{ url: string; init?: any }> = [];
  const held: Array<() => void> = [];
  const modeFor = (h: number): MempoolMode =>
    typeof opts.mempool === 'function' ? opts.mempool(h) : opts.mempool ?? 'ok';
  const f = jest.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url === 'https://mempool.space/api/blocks/tip/height') {
      return opts.tip === null || opts.tip === undefined ? res(503) : res(200, String(opts.tip));
    }
    if (url.startsWith('https://mempool.space')) {
      const byHeight = /block-height\/(\d+)$/.exec(url);
      const byHash = /([0-9a-f]{64})/.exec(url);
      const h = byHeight ? Number(byHeight[1]) : byHash ? heightOfHash(byHash[1]) : -1;
      const mode = modeFor(h);
      if (mode === 'throw') throw new Error('connect timeout');
      if (mode === 'fail500') return res(500);
      if (mode === 'hang') {
        await new Promise<void>((r) => held.push(r));
        return res(503);
      }
      await new Promise((r) => setImmediate(r));
      if (byHeight) return res(200, hashOf(h));
      if (url.endsWith('/summary')) return res(200, JSON.stringify(SUMMARY));
      return res(200, JSON.stringify({ tx_count: SUMMARY.length, size: 1000, weight: 4000, timestamp: 1_700_000_000 }));
    }
    if (url.startsWith(BS)) {
      if (opts.blockstream !== 'ok') return res(503);
      const byHeight = /block-height\/(\d+)$/.exec(url);
      if (byHeight) return res(200, hashOf(Number(byHeight[1])));
      if (/\/txs\/0$/.test(url)) {
        return res(200, JSON.stringify(SUMMARY.map((t) => ({ weight: t.vsize * 4, fee: t.fee, vout: [{ value: t.value }] }))));
      }
      return res(200, JSON.stringify({ tx_count: SUMMARY.length, size: 1000, weight: 4000, timestamp: 1_700_000_000 }));
    }
    throw new Error(`unexpected ${url}`);
  });
  const count = (prefix: string) => calls.filter((c) => c.url.startsWith(prefix)).length;
  return { f, calls, held, mempoolCalls: () => count('https://mempool.space/api/b') + count('https://mempool.space/api/v1'), blockstreamCalls: () => count(BS) };
}

async function ticks(n = 20, until?: () => boolean) {
  for (let i = 0; i < n && !(until && until()); i++) await new Promise((r) => setImmediate(r));
}

let warn: jest.SpyInstance;

beforeEach(() => {
  limiter.reset();
  db.blockThumbnail.findUnique.mockReset().mockResolvedValue(null);
  db.blockThumbnail.create.mockReset().mockResolvedValue({});
  db.blockThumbnail.update.mockReset().mockResolvedValue({});
  // The limiter warns on every fail-open hit; the 'fail' cases would fill the log.
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => warn.mockRestore());

// Each case uses its own heights: the summary and thumbnail modules keep per-instance caches.

describe('getBlockSummary: one fetch per height', () => {
  it('50 concurrent callers for one cold height make at most 3 mempool calls', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    const all = await Promise.all(Array.from({ length: 50 }, () => getBlockSummary(700_101)));
    expect(up.mempoolCalls()).toBeLessThanOrEqual(3);
    expect(new Set(all.map((s) => s.hash))).toEqual(new Set([hashOf(700_101)]));
  });
});

describe('getBlockSummary: the shared upstream budget', () => {
  it('a spent mempool budget makes no fetch and throws a budget refusal', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    limiter.spend(MEMPOOL_BUDGET, 60);
    const err = await getBlockSummary(700_201).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).not.toBeNull();
    expect(err!.name).toBe('UpstreamBudgetError');
    expect(up.f).not.toHaveBeenCalled();
  });

  it('a budget refusal is not negative-cached: once budget is back, the next call fetches', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    limiter.spend(MEMPOOL_BUDGET, 60);
    await expect(getBlockSummary(700_202)).rejects.toBeDefined();
    expect(up.f).not.toHaveBeenCalled();
    limiter.reset();
    const s = await getBlockSummary(700_202);
    expect(s.hash).toBe(hashOf(700_202));
    expect(up.mempoolCalls()).toBe(3);
  });

  it('a spent walk budget after a mempool 500 asks blockstream nothing and keeps mempool’s error', async () => {
    const up = upstream({ mempool: 'fail500', blockstream: 'ok' });
    global.fetch = up.f as any;
    limiter.spend(WALK_BUDGET, 6);
    await expect(getBlockSummary(700_301)).rejects.toThrow('Failed to fetch block hash');
    expect(up.blockstreamCalls()).toBe(0);
  });

  it('with budget left, a mempool 500 still falls back to the walk', async () => {
    const up = upstream({ mempool: 'fail500', blockstream: 'ok' });
    global.fetch = up.f as any;
    const s = await getBlockSummary(700_302);
    expect(s.hash).toBe(hashOf(700_302));
    expect(up.blockstreamCalls()).toBeGreaterThan(0);
    expect(limiter.hits(WALK_BUDGET)).toBe(1);
  });

  it('a limiter that cannot count lets the mempool summary through', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    limiter.setMode('fail');
    const s = await getBlockSummary(700_401);
    expect(s.hash).toBe(hashOf(700_401));
  });

  it('a limiter that cannot count refuses the walk', async () => {
    const up = upstream({ mempool: 'fail500', blockstream: 'ok' });
    global.fetch = up.f as any;
    limiter.setMode('fail');
    await expect(getBlockSummary(700_402)).rejects.toThrow('Failed to fetch block hash');
    expect(up.blockstreamCalls()).toBe(0);
  });
});

describe('fetchEsploraBlockTxs: walk ceiling and abort', () => {
  function walkHost(txCount: number) {
    const pages: number[] = [];
    const f = jest.fn(async (url: string) => {
      if (url.includes('/block-height/')) return res(200, hashOf(612_000));
      const m = /\/txs\/(\d+)$/.exec(url);
      if (m) {
        pages.push(Number(m[1]));
        return res(200, '[]');
      }
      return res(200, JSON.stringify({ tx_count: txCount }));
    });
    return { f, pages };
  }

  it('a block of 6,001 txs fetches no page', async () => {
    const host = walkHost(6_001);
    global.fetch = host.f as any;
    await expect(fetchEsploraBlockTxs(BS, 612_000)).rejects.toThrow('Block too large for the paged fallback');
    expect(host.pages).toEqual([]);
  });

  it('a block of 6,000 txs is still walked', async () => {
    const host = walkHost(6_000);
    global.fetch = host.f as any;
    await expect(fetchEsploraBlockTxs(BS, 612_000)).rejects.toThrow('Short txs page');
    expect(host.pages.length).toBeGreaterThan(0);
  });

  function abortingHost() {
    const signals = new Map<number, AbortSignal>();
    const held: Array<() => void> = [];
    const page = JSON.stringify(Array.from({ length: 25 }, () => ({ weight: 800, vout: [{ value: 1 }] })));
    const f = jest.fn((url: string, init?: any) => {
      if (url.includes('/block-height/')) return Promise.resolve(res(200, hashOf(612_000)));
      const m = /\/txs\/(\d+)$/.exec(url);
      if (!m) return Promise.resolve(res(200, JSON.stringify({ tx_count: 250 })));
      const start = Number(m[1]);
      const signal: AbortSignal = init?.signal;
      signals.set(start, signal);
      if (start === 50) return new Promise((r) => setImmediate(() => r(res(503))));
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
        held.push(() => resolve(res(200, page)));
      });
    });
    return { f, signals, held };
  }

  it('the first failed page aborts every page still in flight', async () => {
    const host = abortingHost();
    global.fetch = host.f as any;
    await expect(fetchEsploraBlockTxs(BS, 612_000)).rejects.toThrow('Failed to fetch txs page 2');
    const others = [...host.signals].filter(([start]) => start !== 50);
    expect(others.length).toBe(3);
    for (const [, signal] of others) expect(signal.aborted).toBe(true);
    host.held.forEach((release) => release());
  });

  it('aborts the same way where AbortSignal.any is missing', async () => {
    const original = (AbortSignal as any).any;
    delete (AbortSignal as any).any;
    try {
      const host = abortingHost();
      global.fetch = host.f as any;
      await expect(fetchEsploraBlockTxs(BS, 612_000)).rejects.toThrow('Failed to fetch txs page 2');
      const others = [...host.signals].filter(([start]) => start !== 50);
      for (const [, signal] of others) expect(signal.aborted).toBe(true);
      host.held.forEach((release) => release());
    } finally {
      (AbortSignal as any).any = original;
    }
  });
});

describe('getBlockThumbnail: cold renders, settled storage, refusals', () => {
  it('past 4 renders in flight, a fifth cold height serves the estimate without a fetch, and is not negative-cached', async () => {
    const COLD = [700_501, 700_502, 700_503, 700_504];
    const up = upstream({ mempool: (h) => (COLD.includes(h) ? 'hang' : 'ok') });
    global.fetch = up.f as any;
    const inFlight = COLD.map((h) => getBlockThumbnail(h));
    await ticks(50, () => up.held.length >= 4);
    expect(up.held.length).toBe(4);

    const before = up.calls.length;
    const fifth = await getBlockThumbnail(700_505);
    expect(fifth.source).toBe('estimated');
    expect(fifth.cacheControl).toBe(SHORT);
    expect(up.calls.length).toBe(before);
    expect(db.blockThumbnail.create).not.toHaveBeenCalled();

    up.held.forEach((release) => release());
    await Promise.all(inFlight);

    const again = await getBlockThumbnail(700_505);
    expect(again.source).toBe('live');
  });

  it('a budget refusal on a cold height serves the estimate and is not negative-cached', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    limiter.spend(MEMPOOL_BUDGET, 60);
    const first = await getBlockThumbnail(700_601);
    expect(first.source).toBe('estimated');
    expect(up.f).not.toHaveBeenCalled();
    limiter.reset();
    const second = await getBlockThumbnail(700_601);
    expect(second.source).toBe('live');
  });

  it('a render 2 blocks below the tip is served short and not stored', async () => {
    const up = upstream({ tip: 980_000 });
    global.fetch = up.f as any;
    const t = await getBlockThumbnail(979_998);
    expect(t.source).toBe('live');
    expect(t.cacheControl).toBe(SHORT);
    expect(db.blockThumbnail.create).not.toHaveBeenCalled();
  });

  it('a render 6 blocks below the tip is stored', async () => {
    const up = upstream({ tip: 980_000 });
    global.fetch = up.f as any;
    const t = await getBlockThumbnail(979_994);
    expect(t.source).toBe('live');
    expect(t.cacheControl).toBe('public, max-age=86400');
    expect(db.blockThumbnail.create).toHaveBeenCalledTimes(1);
    expect(db.blockThumbnail.create.mock.calls[0][0].data.blockHeight).toBe(979_994);
  });

  it('a stale row 3 blocks below the tip is re-rendered but not updated', async () => {
    const up = upstream({ tip: 980_000 });
    global.fetch = up.f as any;
    db.blockThumbnail.findUnique.mockResolvedValue({
      imageData: Uint8Array.from([1, 2, 3]),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    const t = await getBlockThumbnail(979_997);
    expect(t.source).toBe('live');
    expect(t.cacheControl).toBe(SHORT);
    expect(db.blockThumbnail.update).not.toHaveBeenCalled();
  });
});

describe('negative caches are bounded', () => {
  it('2,000 failed heights leave at most 1,024 entries in each negative cache', async () => {
    const summarySize = (blockSummary as any).__negativeCacheSizeForTest;
    const thumbnailSize = (blockThumbnail as any).__negativeCacheSizeForTest;
    expect(typeof summarySize).toBe('function');
    expect(typeof thumbnailSize).toBe('function');
    limiter.setMode('unlimited');
    global.fetch = upstream({ mempool: 'throw', blockstream: 'fail' }).f as any;
    for (let h = 800_000; h < 802_000; h++) await getBlockSummary(h).catch(() => undefined);
    expect(summarySize()).toBeLessThanOrEqual(1_024);
    for (let h = 810_000; h < 812_000; h++) await getBlockThumbnail(h);
    expect(thumbnailSize()).toBeLessThanOrEqual(1_024);
  }, 30_000);
});

describe('fetchBlockOgSummary: budget, redirects, one read per height', () => {
  it('a spent budget answers null without a fetch', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    limiter.spend(OG_BUDGET, 120);
    expect(await fetchBlockOgSummary(840_101)).toBeNull();
    expect(up.f).not.toHaveBeenCalled();
  });

  it('a redirect answers null', async () => {
    const up = upstream();
    // fetch as Node runs it: a 3xx is followed unless the caller said redirect: 'error'.
    global.fetch = jest.fn(async (url: string, init?: any) => {
      if (init?.redirect === 'error') throw new TypeError('fetch failed');
      return up.f(url, init);
    }) as any;
    expect(await fetchBlockOgSummary(840_102)).toBeNull();
  });

  it('charges the budget once per cold height and answers a second read from memory', async () => {
    const up = upstream();
    global.fetch = up.f as any;
    const first = await fetchBlockOgSummary(840_103);
    expect(first?.hash).toBe(hashOf(840_103));
    const calls = up.calls.length;
    const second = await fetchBlockOgSummary(840_103);
    expect(second?.hash).toBe(hashOf(840_103));
    expect(up.calls.length).toBe(calls);
    expect(limiter.hits(OG_BUDGET)).toBe(1);
  });
});
