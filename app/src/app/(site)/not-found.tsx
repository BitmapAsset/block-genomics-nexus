import type { Metadata } from 'next';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: 'Not found | Block Genomics',
  // No robots entry: Next writes <meta name="robots" content="noindex"> on every
  // 404 it renders, and a second one here gave the page two robots metas.
};

// notFound() thrown by a (site) page or layout (e.g. /block/abc) must be caught
// here, inside SiteChrome's error boundary. The root not-found sits outside it,
// so without this file the boundary showed "Something went wrong" instead.
export default function SiteNotFound() {
  return <NotFoundContent />;
}
