import type { Metadata } from 'next';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: 'Not found | Block Genomics',
  robots: { index: false, follow: false },
};

// notFound() thrown by a (site) page or layout (e.g. /block/abc) must be caught
// here, inside SiteChrome's error boundary. The root not-found sits outside it,
// so without this file the boundary showed "Something went wrong" instead.
export default function SiteNotFound() {
  return <NotFoundContent />;
}
