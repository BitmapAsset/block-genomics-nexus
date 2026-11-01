/**
 * /explore renders per request (the root layout awaits connection() for the
 * CSP nonce), so its recent-blocks reads sit in a 60 s data cache instead of a
 * page-level ISR window: while the entry is fresh a view reads nothing, a stale
 * entry is served at once and refreshed in the background. Only the reads are
 * wrapped, so a failed read throws out of the cached function and is never
 * stored; the page's own catch decides what a failure shows.
 */

import { renderToStaticMarkup } from 'react-dom/server';

// Records (fn, keys, options) and hands back fn itself, so the page runs its real reads.
const mockUnstableCache = jest.fn((...a: unknown[]) => a[0]);
jest.mock('next/cache', () => ({
  unstable_cache: (...a: unknown[]) => mockUnstableCache(...a),
}));

const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { block: { findMany: (...a: unknown[]) => mockFindMany(...a), count: async () => 3 } },
}));
jest.mock('@/lib/directory-counts', () => ({ countVerifiedAgents: async () => 2 }));
jest.mock('@/components/BitmapThumbnail', () => () => null);
jest.mock('@/components/GlobalSearch', () => () => null);

import ExplorePage from '@/app/(site)/explore/page';

const env = process.env as Record<string, string | undefined>;
const saved = { NODE_ENV: env.NODE_ENV, NEXT_PHASE: env.NEXT_PHASE };
afterEach(() => {
  env.NODE_ENV = saved.NODE_ENV;
  env.NEXT_PHASE = saved.NEXT_PHASE;
  mockFindMany.mockReset();
});

const wrapped = () => mockUnstableCache.mock.calls[0]?.[0] as (() => Promise<unknown>) | undefined;

it('wraps the reads once, under one key, with a 60 s window', () => {
  expect(mockUnstableCache).toHaveBeenCalledTimes(1);
  const [fn, keys, opts] = mockUnstableCache.mock.calls[0];
  expect(typeof fn).toBe('function');
  expect(keys).toEqual(['explore-recent']);
  expect(opts).toEqual({ revalidate: 60 });
});

it('renders the recent list from the cached reads', async () => {
  mockFindMany.mockResolvedValue([
    { height: 840000, label: null },
    { height: 720143, label: 'x' },
  ]);
  const html = renderToStaticMarkup(await ExplorePage());
  expect(html).toContain('840000.bitmap');
  expect(html).toContain('720143.bitmap');
  expect(html).toContain('3 blocks on record');
  expect(html).not.toContain('couldn&#x27;t be loaded');
});

it('throws in production when the read fails (a cold entry shows the error state)', async () => {
  env.NODE_ENV = 'production';
  delete env.NEXT_PHASE;
  mockFindMany.mockRejectedValue(new Error('db down'));
  await expect(ExplorePage()).rejects.toThrow('db down');
});

it('outside production shows the unavailable state, and the failure came from the wrapped function', async () => {
  env.NODE_ENV = 'development';
  mockFindMany.mockRejectedValue(new Error('db down'));
  const html = renderToStaticMarkup(await ExplorePage());
  expect(html).toContain('couldn&#x27;t be loaded right now');
  // The cached function itself rejects, so no "unavailable" value is ever handed to the cache.
  const fn = wrapped();
  expect(fn).toBeDefined();
  await expect(fn!()).rejects.toThrow('db down');
});
