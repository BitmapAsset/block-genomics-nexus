import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: 'Not found | Block Genomics',
  // No robots entry: Next writes <meta name="robots" content="noindex"> on every
  // 404 it renders, and a second one here gave the page two robots metas.
};

// Unmatched URLs render here, under the root layout only (no route group), so
// it brings the site chrome itself. notFound() from a (site) page or layout is
// caught by (site)/not-found.tsx instead, inside the chrome's error boundary.
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
