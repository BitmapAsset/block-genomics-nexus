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

/** Heights with at least one visible object or a published experience. */
async function blocksWorthListing(): Promise<number[]> {
  try {
    const [objects, experiences] = await Promise.all([
      prisma.blockObject.findMany({
        where: { visible: true },
        distinct: ['blockHeight'],
        select: { blockHeight: true },
        orderBy: { blockHeight: 'asc' },
        take: MAX_BLOCK_URLS,
      }),
      prisma.experience.findMany({
        where: { soulJudged: true },
        distinct: ['blockHeight'],
        select: { blockHeight: true },
        orderBy: { blockHeight: 'asc' },
        take: MAX_BLOCK_URLS,
      }),
    ]);

    const heights = new Set<number>();
    for (const row of [...objects, ...experiences]) heights.add(row.blockHeight);
    return Array.from(heights)
      .sort((a, b) => a - b)
      .slice(0, MAX_BLOCK_URLS);
  } catch {
    // A sitemap missing its block section beats a 500 that costs the static
    // routes their listing too.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
    { path: '/protocol', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/nexus', priority: 0.8, changeFrequency: 'daily' },
    { path: '/directory', priority: 0.7, changeFrequency: 'daily' },
    { path: '/rentals', priority: 0.6, changeFrequency: 'daily' },
    { path: '/verify', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/whitepaper', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/leaderboard', priority: 0.5, changeFrequency: 'daily' },
    { path: '/history', priority: 0.4, changeFrequency: 'weekly' },
  ];

  const staticEntries = routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const blockEntries = (await blocksWorthListing()).map((height) => ({
    url: `${BASE}/block/${height}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  return [...staticEntries, ...blockEntries];
}
