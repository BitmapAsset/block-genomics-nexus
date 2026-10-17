'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The page declines to wait for the throttled indexer, so a first render can
 * say "checking". This re-renders it a few times (3 s, 6 s, 9 s) until the
 * answer is in, instead of asking the reader to reload.
 */
export default function DeedRecheck({ pending }: { pending: boolean }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pending || attempt >= 3) return;
    const t = setTimeout(() => {
      router.refresh();
      setAttempt((a) => a + 1);
    }, 3000 * (attempt + 1));
    return () => clearTimeout(t);
  }, [pending, attempt, router]);

  return null;
}
