/**
 * The 1200×630 share card for every page without its own (QA scorecard
 * 2026-10-22 row #7). The root layout sets it; a page that declares its own
 * `openGraph` replaces the layout's object wholesale, so it lists the card too.
 */
export const SITE_CARD = {
  url: '/og-site.png',
  width: 1200,
  height: 630,
  alt: 'Block Genomics — Sovereign land on Bitcoin. Powered by AI.',
};

/**
 * A page's own share text for both unfurl formats (QA 2026-10-22 #17). X reads
 * `twitter:*` and falls back to the root layout's when a page sets only
 * `openGraph`, so every page that has its own text sets both, card included.
 */
export function shareMetadata({
  title,
  description,
  path,
  image = SITE_CARD,
  type = 'website',
}: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; width: number; height: number; alt: string };
  type?: 'website' | 'article';
}) {
  return {
    openGraph: { title, description, url: path, siteName: 'Block Genomics', type, images: [image] },
    twitter: { card: 'summary_large_image' as const, title, description, images: [image.url] },
  };
}
