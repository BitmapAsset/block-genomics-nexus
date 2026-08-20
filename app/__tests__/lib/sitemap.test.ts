/**
 * Tests for src/app/sitemap.ts
 *
 * ~900k blocks have a valid page, so the only interesting property is that the
 * sitemap stays a bounded, curated set and never takes the static routes down
 * with it when the database is unavailable.
 */

const mockObjectFindMany = jest.fn();
const mockExperienceFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    blockObject: { findMany: (...a: unknown[]) => mockObjectFindMany(...a) },
    experience: { findMany: (...a: unknown[]) => mockExperienceFindMany(...a) },
  },
}));

import sitemap from '@/app/sitemap';

const blockUrls = (entries: { url: string }[]) => entries.filter((e) => e.url.includes('/block/'));

beforeEach(() => {
  jest.clearAllMocks();
  mockObjectFindMany.mockResolvedValue([]);
  mockExperienceFindMany.mockResolvedValue([]);
});

describe('sitemap()', () => {
  it('always lists the static routes', async () => {
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain('https://blockgenomics.io/');
    expect(urls).toContain('https://blockgenomics.io/nexus');
  });

  it('lists only blocks that have something on them', async () => {
    mockObjectFindMany.mockResolvedValue([{ blockHeight: 840000 }]);
    mockExperienceFindMany.mockResolvedValue([{ blockHeight: 21000 }]);

    const urls = blockUrls(await sitemap()).map((e) => e.url);

    expect(urls).toEqual([
      'https://blockgenomics.io/block/21000',
      'https://blockgenomics.io/block/840000',
    ]);
  });

  it('lists a block once when it has both objects and experiences', async () => {
    mockObjectFindMany.mockResolvedValue([{ blockHeight: 840000 }]);
    mockExperienceFindMany.mockResolvedValue([{ blockHeight: 840000 }]);

    expect(blockUrls(await sitemap())).toHaveLength(1);
  });

  it('asks the database for a bounded set rather than every block', async () => {
    await sitemap();

    for (const call of [mockObjectFindMany.mock.calls[0][0], mockExperienceFindMany.mock.calls[0][0]]) {
      expect(call.take).toBeLessThanOrEqual(5000);
      expect(call.distinct).toEqual(['blockHeight']);
    }
  });

  it('caps the block section even if the database returns more than the ceiling', async () => {
    mockObjectFindMany.mockResolvedValue(
      Array.from({ length: 5000 }, (_, i) => ({ blockHeight: i })),
    );
    mockExperienceFindMany.mockResolvedValue(
      Array.from({ length: 5000 }, (_, i) => ({ blockHeight: 100_000 + i })),
    );

    expect(blockUrls(await sitemap())).toHaveLength(5000);
  });

  it('still serves the static routes when the database is down', async () => {
    mockObjectFindMany.mockRejectedValue(new Error('ECONNREFUSED'));
    mockExperienceFindMany.mockRejectedValue(new Error('ECONNREFUSED'));

    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(blockUrls(entries)).toHaveLength(0);
  });

  it('only lists visible objects and published experiences', async () => {
    await sitemap();

    expect(mockObjectFindMany.mock.calls[0][0].where).toEqual({ visible: true });
    expect(mockExperienceFindMany.mock.calls[0][0].where).toEqual({ soulJudged: true });
  });
});
