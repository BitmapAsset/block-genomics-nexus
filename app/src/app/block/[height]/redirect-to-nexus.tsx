'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sends a human straight through to the map. The parent page stays a real HTML
 * response (rather than a 307) so unfurlers can read its share tags — they do
 * not run JS, so they never follow this.
 */
export default function RedirectToNexus({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
