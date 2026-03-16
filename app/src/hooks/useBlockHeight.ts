'use client';

import { useEffect, useState } from 'react';

/**
 * Shared block height fetcher — deduplicates mempool.space API calls.
 *
 * Multiple landing-page components (LiveBlockCount, LiveStats, RotatingTagline)
 * all need the current Bitcoin block height. Instead of each component fetching
 * independently (3 duplicate calls), this hook uses a module-level cache so only
 * one network request is made per refresh interval.
 */

interface CacheEntry {
  height: number | null;
  ts: number;
  promise: Promise<number | null> | null;
}

const cache: CacheEntry = { height: null, ts: 0, promise: null };
const STALE_MS = 30_000; // 30 seconds

function fetchHeight(): Promise<number | null> {
  // If there's an in-flight request, reuse it
  if (cache.promise) return cache.promise;

  cache.promise = fetch('https://mempool.space/api/blocks/tip/height')
    .then((res) => {
      if (!res.ok) return cache.height;
      return res.json() as Promise<number>;
    })
    .then((h) => {
      if (typeof h === 'number' && h > 0) {
        cache.height = h;
        cache.ts = Date.now();
      }
      return cache.height;
    })
    .catch(() => cache.height)
    .finally(() => {
      cache.promise = null;
    });

  return cache.promise;
}

export function useBlockHeight(refreshInterval = STALE_MS): number | null {
  const [height, setHeight] = useState<number | null>(cache.height);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const now = Date.now();
      // Only fetch if cache is stale
      if (now - cache.ts > STALE_MS || cache.height === null) {
        const h = await fetchHeight();
        if (!cancelled) setHeight(h);
      } else if (cache.height !== null) {
        if (!cancelled) setHeight(cache.height);
      }
    }

    refresh();
    const iv = setInterval(refresh, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [refreshInterval]);

  return height;
}
