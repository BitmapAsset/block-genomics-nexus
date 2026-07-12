import type { MetadataRoute } from 'next';

const BASE = 'https://blockgenomics.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
    { path: '/protocol', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/nexus', priority: 0.8, changeFrequency: 'daily' },
    { path: '/directory', priority: 0.7, changeFrequency: 'daily' },
    { path: '/marketplace', priority: 0.6, changeFrequency: 'daily' },
    { path: '/verify', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/whitepaper', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/leaderboard', priority: 0.5, changeFrequency: 'daily' },
    { path: '/history', priority: 0.4, changeFrequency: 'weekly' },
  ];
  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
