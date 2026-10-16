/**
 * `GET /og/block/[height]` — the 1200×630 share card X and the other unfurlers
 * fetch for `/block/[height]`.
 *
 * A card is only cached long when it carries real bitmap art. A card rendered
 * without art (thumbnail fetch failed or timed out) or with estimated art gets a
 * one-minute cache, so a CDN cannot pin an art-less card for a week. The header
 * is the route's alone: next.config.ts must not carry an /og/ entry, because a
 * config entry overrides a Cache-Control the handler set.
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

import nextConfig from '../../next.config';
import { GET } from '@/app/og/block/[height]/route';

const LONG = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const SHORT = 'public, max-age=60';

/** The thumbnail route's answer: a PNG tagged with how its art was produced. */
const thumbnail = (source: string) => ({
  ok: true,
  headers: new Headers({ 'content-type': 'image/png', 'x-thumbnail-source': source }),
  arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
});

async function cacheControlFor(height: string): Promise<string> {
  const res = (await GET(new Request(`http://localhost:3110/og/block/${height}`), {
    params: Promise.resolve({ height }),
  })) as unknown as { headers: Record<string, string> };
  return res.headers['Cache-Control'];
}

const realFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockImageResponse.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('GET /og/block/[height] Cache-Control', () => {
  it('caches a card with real art long', async () => {
    mockFetch.mockResolvedValue(thumbnail('cache'));
    expect(await cacheControlFor('840000')).toBe(LONG);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3110/api/v1/block-thumbnail/840000.png?v=2',
      expect.anything(),
    );
  });

  it('caches a freshly rendered (live) card long', async () => {
    mockFetch.mockResolvedValue(thumbnail('live'));
    expect(await cacheControlFor('840000')).toBe(LONG);
  });

  it('caches an art-less card (thumbnail fetch timed out) for one minute', async () => {
    mockFetch.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(await cacheControlFor('840000')).toBe(SHORT);
  });

  it('caches an art-less card (thumbnail route errored) for one minute', async () => {
    mockFetch.mockResolvedValue({ ok: false, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) });
    expect(await cacheControlFor('840000')).toBe(SHORT);
  });

  it.each(['estimated', 'stale-estimated'])('caches a card with %s art for one minute', async (source) => {
    mockFetch.mockResolvedValue(thumbnail(source));
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
