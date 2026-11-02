'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Refreshes the page re-renders while a check is running (at 3 s, 6 s, 9 s). */
const DEED_RECHECK_ATTEMPTS = 3;

/**
 * The page declines to wait for Bitcoin, so a first render can say
 * "Checking…". This re-renders it a few times (3 s, 6 s, 9 s) until the answer
 * is in, instead of asking the reader to reload. After the last refresh it
 * stops and says so in one line: no spinner, no timer left running.
 */
export default function DeedRecheck({ pending }: { pending: boolean }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pending || attempt >= DEED_RECHECK_ATTEMPTS) return;
    const t = setTimeout(() => {
      router.refresh();
      setAttempt((a) => a + 1);
    }, 3000 * (attempt + 1));
    return () => clearTimeout(t);
  }, [pending, attempt, router]);

  if (pending && attempt >= DEED_RECHECK_ATTEMPTS) {
    return (
      <p className="mt-2 text-sm text-text-secondary" data-testid="deed-recheck-final">
        No answer from Bitcoin yet. Showing the last recorded holder.
      </p>
    );
  }
  return null;
}
