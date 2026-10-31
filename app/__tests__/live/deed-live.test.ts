/**
 * test:live — the deed module against the real chain sources.
 *
 * Skipped unless BG_LIVE_TESTS=1 (`npm run test:live`): it needs ordinals.com
 * (or the ORD_BASE_URLS host) and Esplora. The ids are the canonical deeds the
 * resolver recorded in packages/bitmap-resolver/test/vectors (2026-10-15);
 * 612888 and 718840 also match the inscriptionId the production block API shows.
 */
import { canonicalDeedFor, __resetDeedCacheForTest } from '@/lib/onchain/deed';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  // No database in a live run: the deed module then uses its in-process cache.
  default: { deedVerdict: { findUnique: async () => null, upsert: async () => undefined } },
}));

const live = process.env.BG_LIVE_TESTS === '1';

(live ? describe : describe.skip)('test:live canonical deeds', () => {
  beforeAll(() => __resetDeedCacheForTest());

  it.each([
    [612888, 'daf63d78f6e4cbf8cc5d0b375978c9c707849b5ee0dac909813cef7db66da2d9i0'],
    [718840, 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0'],
    [840000, '05f8584cf4dbe34ef677f8f316fcac9e6e4ccb0e298d53fd21edaac7787660eei0'],
  ])('%i resolves canonical to %s', async (height, id) => {
    const started = Date.now();
    const deed = await canonicalDeedFor(height, { budgetMs: 60_000 });
    console.log(JSON.stringify({ height, verdict: deed.verdict, ms: Date.now() - started, reason: deed.reason ?? null }));
    expect(deed).toMatchObject({ verdict: 'canonical', inscriptionId: id });
  }, 90_000);
});
