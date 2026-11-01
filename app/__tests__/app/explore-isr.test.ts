/**
 * QA 2026-10-22 #18 (the /explore half): /explore rendered on every hit with
 * `private, no-store`, so a traffic spike was one database read per view. The
 * page now renders per request (CSP nonce) and its reads sit in a 60 s data
 * cache (explore-recent-cache.test.ts). A failed read in production throws, so
 * the page shows its error state rather than the "couldn't be loaded" state.
 */

// Pass-through: the data cache itself is covered in explore-recent-cache.test.ts.
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { block: { findMany: (...a: unknown[]) => mockFindMany(...a), count: async () => 3 } },
}));
jest.mock('@/lib/directory-counts', () => ({ countVerifiedAgents: async () => 2 }));
jest.mock('@/components/BitmapThumbnail', () => () => null);
jest.mock('@/components/GlobalSearch', () => () => null);

import * as explore from '@/app/(site)/explore/page';

const env = process.env as Record<string, string | undefined>;
const saved = { NODE_ENV: env.NODE_ENV, NEXT_PHASE: env.NEXT_PHASE };
afterEach(() => {
  env.NODE_ENV = saved.NODE_ENV;
  env.NEXT_PHASE = saved.NEXT_PHASE;
});

it('has no route-segment revalidate or dynamic export (the 60 s window is a data cache)', () => {
  expect((explore as Record<string, unknown>).revalidate).toBeUndefined();
  expect((explore as Record<string, unknown>).dynamic).toBeUndefined();
});

it('throws on a failed read in production (the page shows its error state)', async () => {
  env.NODE_ENV = 'production';
  delete env.NEXT_PHASE;
  mockFindMany.mockRejectedValue(new Error('db down'));
  await expect(explore.default()).rejects.toThrow('db down');
});

it('renders the unavailable state at build time, when there is no database', async () => {
  env.NODE_ENV = 'production';
  env.NEXT_PHASE = 'phase-production-build';
  mockFindMany.mockRejectedValue(new Error('no database'));
  await expect(explore.default()).resolves.toBeTruthy();
});
