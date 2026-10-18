/**
 * `GET /og/block/[height]` — the 1200×630 share card X and the other unfurlers
 * fetch for `/block/[height]`.
 *
 * A card is only cached long when it carries real bitmap art. A card rendered
 * without art (thumbnail failed or timed out) or with estimated art gets a
 * one-minute cache, so a CDN cannot pin an art-less card for a week. The header
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

jest.mock('@/lib/blockOgData', () => ({
  fetchBlockOgSummary: async () => null,
}));

jest.mock('@/lib/blockPageData', () => ({
  fetchBlockCardFacts: async () => ({ objectCount: 0, owner: null, verified: false }),
  shortenAddress: (a: string) => a,
}));

const mockThumbnail = jest.fn();
jest.mock('@/lib/block-thumbnail', () => ({
  getBlockThumbnail: (...a: unknown[]) => mockThumbnail(...a),
}));

import nextConfig from '../../next.config';
import { GET } from '@/app/og/block/[height]/route';

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
  mockThumbnail.mockReset();
  mockImageResponse.mockReset();
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
