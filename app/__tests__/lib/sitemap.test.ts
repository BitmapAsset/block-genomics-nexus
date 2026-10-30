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

describe('sitemap() lastmod', () => {
  const staticEntries = async () => (await sitemap()).filter((e) => !e.url.includes('/block/'));

  it('gives every static entry a real date', async () => {
    for (const e of await staticEntries()) {
      expect(e.lastModified).toBeInstanceOf(Date);
      expect(Number.isNaN((e.lastModified as Date).getTime())).toBe(false);
    }
  });

  it('carries more than one distinct lastmod across the static routes', async () => {
    const days = new Set((await staticEntries()).map((e) => (e.lastModified as Date).toISOString()));

    expect(days.size).toBeGreaterThanOrEqual(2);
  });

  it('never stamps a static entry with the time the sitemap was built', async () => {
    const built = Date.now();
    for (const e of await staticEntries()) {
      expect(Math.abs(built - (e.lastModified as Date).getTime())).toBeGreaterThan(1000);
    }
  });

  it('lists each static route once', async () => {
    const urls = (await staticEntries()).map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it('lists the docs split, /runebolt and /connect, and keeps app views out', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const base = 'https://blockgenomics.io';

    for (const path of [
      '/docs',
      '/docs/quickstart-cli',
      '/docs/quickstart-sdk',
      '/docs/concepts',
      '/docs/api',
      '/docs/cli',
      '/docs/sdk',
      '/docs/faq',
      '/docs/what-is-a-bitmap',
      '/docs/bitcoin-mcp-server',
      '/docs/ai-agent-identity-bitcoin',
      '/runebolt',
      '/connect',
    ]) {
      expect(urls).toContain(`${base}${path}`);
    }
    for (const path of ['/history', '/account', '/agent', '/live', '/offline', '/verify', '/mcp']) {
      expect(urls).not.toContain(`${base}${path}`);
    }
  });

  it('stamps a block with the newest updatedAt among its objects and experiences', async () => {
    mockObjectFindMany.mockResolvedValue([{ blockHeight: 840000, updatedAt: new Date('2026-10-01T00:00:00Z') }]);
    mockExperienceFindMany.mockResolvedValue([
      { blockHeight: 840000, updatedAt: new Date('2026-10-20T12:00:00Z') },
      { blockHeight: 21000, updatedAt: new Date('2026-09-05T00:00:00Z') },
    ]);

    const blocks = blockUrls(await sitemap()) as { url: string; lastModified?: Date }[];

    expect(blocks.map((b) => [b.url, b.lastModified?.toISOString()])).toEqual([
      ['https://blockgenomics.io/block/21000', '2026-09-05T00:00:00.000Z'],
      ['https://blockgenomics.io/block/840000', '2026-10-20T12:00:00.000Z'],
    ]);
  });

  it('orders rows newest first per height so distinct keeps the latest', async () => {
    await sitemap();

    for (const call of [mockObjectFindMany.mock.calls[0][0], mockExperienceFindMany.mock.calls[0][0]]) {
      expect(call.select).toEqual({ blockHeight: true, updatedAt: true });
      expect(call.orderBy).toEqual([{ blockHeight: 'asc' }, { updatedAt: 'desc' }]);
    }
  });

  it('omits lastModified on a block with no usable timestamp', async () => {
    mockObjectFindMany.mockResolvedValue([{ blockHeight: 840000 }]);

    const [block] = blockUrls(await sitemap()) as { lastModified?: Date }[];

    expect('lastModified' in block).toBe(false);
  });
});
