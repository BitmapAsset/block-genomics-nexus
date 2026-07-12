import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: 'https://blockgenomics.io/sitemap.xml',
    host: 'https://blockgenomics.io',
  };
}
