import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

const BASE = 'https://blockgenomics.io';

/**
 * Ceiling on block URLs. Every one of the ~900k mined blocks has a valid
 * `/block/{height}` page, so a complete sitemap is neither allowed (50k URLs
 * per file) nor useful — it would be overwhelmingly pages with nothing on them,
 * which is how a site teaches a crawler to ignore its sitemap. Only blocks
 * somebody has actually built on are listed; the rest stay discoverable through
 * The Nexus and direct links.
 */
const MAX_BLOCK_URLS = 5_000;

/**
 * Regenerated hourly rather than at build time: which blocks have content is
 * database state, and the build runs without a database.
 */
export const revalidate = 3600;

/**
 * The date each static page's content last changed, `YYYY-MM-DD`. Hand
 * maintained on purpose: a lastmod that is always "now" tells a crawler nothing
 * and teaches it to ignore the field for the whole site. Bump a route's date
 * when the page content changes. Seeded from
 * `git log -1 --format=%cs -- <page file>` for each route.
 */
const ROUTE_LASTMOD: Record<string, string> = {
  '/': '2026-10-28',
  '/protocol': '2026-10-22',
  '/docs': '2026-10-30',
  '/docs/quickstart-cli': '2026-10-30',
  '/docs/quickstart-sdk': '2026-10-30',
  '/docs/concepts': '2026-10-30',
  '/docs/api': '2026-10-30',
  '/docs/cli': '2026-10-30',
  '/docs/sdk': '2026-10-30',
  '/docs/faq': '2026-10-30',
  '/docs/what-is-a-bitmap': '2026-10-30',
  '/docs/bitcoin-mcp-server': '2026-10-30',
  '/docs/ai-agent-identity-bitcoin': '2026-10-30',
  '/docs/experience-hosting': '2026-10-22',
  '/explore': '2026-10-28',
  '/my-bitmaps': '2026-10-30',
  '/nexus': '2026-10-22',
  '/directory': '2026-10-28',
  '/rentals': '2026-10-28',
  '/brain': '2026-10-22',
  '/whitepaper': '2026-10-30',
  '/runebolt': '2026-10-30',
  '/connect': '2026-10-30',
};

type Route = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
};

/** Pages a stranger can read or use without a wallet. `/history` stays out. */
const ROUTES: Route[] = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/protocol', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/docs', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/docs/quickstart-cli', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/quickstart-sdk', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/concepts', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/api', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/cli', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/docs/sdk', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/docs/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/what-is-a-bitmap', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/bitcoin-mcp-server', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/ai-agent-identity-bitcoin', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs/experience-hosting', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/explore', priority: 0.8, changeFrequency: 'daily' },
  { path: '/my-bitmaps', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/nexus', priority: 0.8, changeFrequency: 'daily' },
  { path: '/directory', priority: 0.7, changeFrequency: 'daily' },
  { path: '/rentals', priority: 0.6, changeFrequency: 'daily' },
  { path: '/brain', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/whitepaper', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/runebolt', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/connect', priority: 0.5, changeFrequency: 'monthly' },
];

/** A block worth listing and the newest change on it, when the schema says. */
type ListedBlock = { height: number; lastModified: Date | undefined };

const validDate = (value: unknown): Date | undefined =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;

/**
 * Heights with at least one visible object or a published experience, each with
 * the newest `updatedAt` among those rows. Ordering by `updatedAt desc` under
 * `distinct` keeps the newest row per height, so a block's lastmod is when
 * something on it changed rather than when this sitemap was rebuilt.
 */
async function blocksWorthListing(): Promise<ListedBlock[]> {
  try {
    const [objects, experiences] = await Promise.all([
      prisma.blockObject.findMany({
        where: { visible: true },
        distinct: ['blockHeight'],
        select: { blockHeight: true, updatedAt: true },
        orderBy: [{ blockHeight: 'asc' }, { updatedAt: 'desc' }],
        take: MAX_BLOCK_URLS,
      }),
      prisma.experience.findMany({
        where: { soulJudged: true },
        distinct: ['blockHeight'],
        select: { blockHeight: true, updatedAt: true },
        orderBy: [{ blockHeight: 'asc' }, { updatedAt: 'desc' }],
        take: MAX_BLOCK_URLS,
      }),
    ]);

    const newest = new Map<number, Date | undefined>();
    for (const row of [...objects, ...experiences]) {
      const at = validDate(row.updatedAt);
      const seen = newest.get(row.blockHeight);
      if (!newest.has(row.blockHeight) || (at && (!seen || at > seen))) {
        newest.set(row.blockHeight, at);
      }
    }
    return Array.from(newest.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, MAX_BLOCK_URLS)
      .map(([height, lastModified]) => ({ height, lastModified }));
  } catch {
    // A sitemap missing its block section beats a 500 that costs the static
    // routes their listing too.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: new Date(`${ROUTE_LASTMOD[r.path]}T00:00:00Z`),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // A block without a usable timestamp gets no lastModified: omitting the field
  // beats stamping it with the time the sitemap was built.
  const blockEntries = (await blocksWorthListing()).map(({ height, lastModified }) => ({
    url: `${BASE}/block/${height}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  return [...staticEntries, ...blockEntries];
}
