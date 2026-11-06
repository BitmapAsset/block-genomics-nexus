/**
 * `GET /og/block/[height]` — the 1200×630 share card X and the other unfurlers
 * fetch for `/block/[height]`.
 *
 * A card is only cached long when it carries real bitmap art and the chain
 * stats. A card rendered without art (thumbnail failed or timed out), with
 * estimated art, or without the chain stats (mempool.space unread) gets a
 * one-minute cache, so a CDN cannot pin an incomplete card for a week. The header
 * is the route's alone: next.config.ts must not carry an /og/ entry, because a
 * config entry overrides a Cache-Control the handler set.
 *
 * The art comes from lib/block-thumbnail in-process (never over HTTP at the
 * request's origin; see __tests__/security/og-block-ssrf.test.ts), so that
 * module is what is stubbed here.
 */

const mockImageResponse = jest.fn();
jest.mock('next/og', () => ({
  ImageResponse: class {
    public headers: Record<string, string>;
    constructor(_element: unknown, options: { headers?: Record<string, string> }) {
      mockImageResponse(options);
      this.headers = options.headers ?? {};
    }
  },
}));

const OG_SUMMARY = {
  height: 840000,
  hash: '0'.repeat(64),
  timestamp: 1_713_571_767,
  txCount: 3050,
  size: 2_325_617,
  genome: 'a'.repeat(64),
};
const mockOgSummary = jest.fn(async () => OG_SUMMARY as typeof OG_SUMMARY | null);
jest.mock('@/lib/blockOgData', () => ({
  fetchBlockOgSummary: () => mockOgSummary(),
}));

jest.mock('@/lib/blockPageData', () => ({
  fetchBlockCardFacts: async () => ({ objectCount: 0, owner: null, verified: false }),
  shortenAddress: (a: string) => a,
}));

const mockTip = jest.fn(async () => 972_600 as number | null);
jest.mock('@/lib/block-summary', () => ({
  getTipHeight: () => mockTip(),
}));

const mockThumbnail = jest.fn();
jest.mock('@/lib/block-thumbnail', () => ({
  getBlockThumbnail: (...a: unknown[]) => mockThumbnail(...a),
}));

// The card is rate limited per caller; the real limiter runs over an in-memory counter.
jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memoryRateLimiter } = require('../helpers/rate-limit-memory');
  const limiter = memoryRateLimiter();
  const client = { $queryRaw: limiter.$queryRaw, __limiter: limiter };
  return { __esModule: true, default: client, prisma: client };
});

import nextConfig from '../../next.config';
import prisma from '@/lib/prisma';
import { GET } from '@/app/og/block/[height]/route';

const limiter = (prisma as unknown as { __limiter: { reset(): void } }).__limiter;

const LONG = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const SHORT = 'public, max-age=60';

/** The thumbnail module's answer: a PNG tagged with how its art was produced. */
const thumbnail = (source: string) => ({
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  cacheControl: 'public, max-age=60',
  source,
});

async function cacheControlFor(height: string): Promise<string> {
  const res = (await GET(new Request(`http://localhost:3110/og/block/${height}`), {
    params: Promise.resolve({ height }),
  })) as unknown as { headers: Record<string, string> };
  return res.headers['Cache-Control'];
}

beforeEach(() => {
  limiter.reset();
  mockThumbnail.mockReset();
  mockImageResponse.mockReset();
  mockOgSummary.mockReset().mockResolvedValue(OG_SUMMARY);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GET /og/block/[height] Cache-Control', () => {
  it('caches a card with real art long', async () => {
    mockThumbnail.mockResolvedValue(thumbnail('cache'));
    expect(await cacheControlFor('840000')).toBe(LONG);
    expect(mockThumbnail).toHaveBeenCalledWith(840000);
  });

  it('caches a freshly rendered (live) card long', async () => {
    mockThumbnail.mockResolvedValue(thumbnail('live'));
    expect(await cacheControlFor('840000')).toBe(LONG);
  });

  it('caches an art-less card (thumbnail timed out after 4 s) for one minute', async () => {
    jest.useFakeTimers();
    mockThumbnail.mockReturnValue(new Promise(() => {}));
    const pending = cacheControlFor('840000');
    await jest.advanceTimersByTimeAsync(4000);
    expect(await pending).toBe(SHORT);
  });

  it('caches an art-less card (thumbnail errored) for one minute', async () => {
    mockThumbnail.mockRejectedValue(new Error('render failed'));
    expect(await cacheControlFor('840000')).toBe(SHORT);
  });

  it.each(['estimated', 'stale-estimated'])('caches a card with %s art for one minute', async (source) => {
    mockThumbnail.mockResolvedValue(thumbnail(source));
    expect(await cacheControlFor('123457')).toBe(SHORT);
  });
});

describe('GET /og/block/[height] Cache-Control and the chain stats', () => {
  it.each(['cache', 'live'])('caches a card with real (%s) art but no chain stats for one minute', async (source) => {
    mockThumbnail.mockResolvedValue(thumbnail(source));
    mockOgSummary.mockResolvedValue(null);
    expect(await cacheControlFor('840000')).toBe(SHORT);
  });

  it('caches a card with real art and the chain stats long', async () => {
    mockThumbnail.mockResolvedValue(thumbnail('cache'));
    mockOgSummary.mockResolvedValue(OG_SUMMARY);
    expect(await cacheControlFor('840000')).toBe(LONG);
  });

  it('caches a card with the chain stats but no art for one minute', async () => {
    mockThumbnail.mockRejectedValue(new Error('render failed'));
    mockOgSummary.mockResolvedValue(OG_SUMMARY);
    expect(await cacheControlFor('840000')).toBe(SHORT);
  });
});

describe('GET /og/block/[height] per-caller limit', () => {
  it('answers the 31st request in a window from one address with 429 no-store', async () => {
    mockThumbnail.mockResolvedValue(thumbnail('cache'));
    const call = () =>
      GET(new Request('http://localhost:3110/og/block/840000', { headers: { 'x-forwarded-for': '203.0.113.9' } }), {
        params: Promise.resolve({ height: '840000' }),
      }) as unknown as Promise<{ status?: number; headers: unknown }>;
    for (let i = 0; i < 30; i++) {
      const ok = await call();
      expect(ok.status ?? 200).toBe(200);
    }
    const res = (await call()) as unknown as Response;
    expect(res.status).toBe(429);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockImageResponse).toHaveBeenCalledTimes(30);
  });

  it('another address still gets its card', async () => {
    mockThumbnail.mockResolvedValue(thumbnail('cache'));
    for (let i = 0; i < 30; i++) {
      await GET(new Request('http://localhost:3110/og/block/840000', { headers: { 'x-forwarded-for': '203.0.113.10' } }), {
        params: Promise.resolve({ height: '840000' }),
      });
    }
    mockImageResponse.mockReset();
    await GET(new Request('http://localhost:3110/og/block/840000', { headers: { 'x-forwarded-for': '198.51.100.7' } }), {
      params: Promise.resolve({ height: '840000' }),
    });
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });
});

describe('next.config.ts headers for /og/', () => {
  it('sets no Cache-Control on /og/ paths, so the route header stands', async () => {
    const entries = await nextConfig.headers!();
    const ogPath = '/og/block/840000';
    for (const entry of entries) {
      // Next matches `source` as a path-to-regexp pattern; these entries use
      // either `:path*` params or a raw regex group, both covered by this check.
      const pattern = new RegExp(
        '^' + entry.source.replace(/:path\*/g, '.*') + '$',
      );
      if (!pattern.test(ogPath)) continue;
      expect(entry.headers.map((h) => h.key.toLowerCase())).not.toContain('cache-control');
    }
  });
});

describe('GET /og/block/[height] above the chain tip (QA #9)', () => {
  it('answers 404 instead of a card for a height that is not mined yet', async () => {
    const res = (await GET(new Request('http://localhost:3110/og/block/980000'), {
      params: Promise.resolve({ height: '980000' }),
    })) as unknown as Response;
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockImageResponse).not.toHaveBeenCalled();
  });

  it('still renders a card when the tip cannot be read', async () => {
    mockTip.mockResolvedValueOnce(null);
    mockThumbnail.mockResolvedValue(thumbnail('live'));
    await cacheControlFor('980000');
    expect(mockImageResponse).toHaveBeenCalled();
  });
});
