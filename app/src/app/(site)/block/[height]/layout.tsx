import { notFound } from 'next/navigation';
import { parseBlockParam } from '@/lib/blockDeepLink';

/**
 * Height validation lives in the layout, not the page, because this segment has
 * a `loading.tsx`.
 *
 * `loading.tsx` wraps the *page* in a Suspense boundary, and Next flushes that
 * fallback — status line included — as soon as it starts streaming. A
 * `notFound()` thrown inside the page therefore lands after the response is
 * committed: the body is swapped for the 404 but the status stays 200, which is
 * a soft 404 that crawlers index as a real page.
 *
 * The layout renders above that boundary, so throwing here still sets a true
 * 404 status. Deleting `loading.tsx` would fix it too, at the cost of the
 * loading state on client-side navigation.
 */
export default async function BlockLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ height: string }>;
}) {
  const { height } = await params;
  if (parseBlockParam(height) === undefined) notFound();

  return children;
}
