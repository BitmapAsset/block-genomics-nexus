'use client';

import { useEffect, useState } from 'react';

/**
 * Shared stats fetcher — deduplicates /api/v1/stats calls.
 *
 * Both Footer and LiveStats independently fetch the same endpoint.
 * This hook uses a module-level cache (same pattern as useBlockHeight)
 * so only one request is made per stale window.
 */

interface StatsData {
  verifiedAgents: number;
  blocksVerified: number;
  genomesMinted: number;
}

interface CacheEntry {
  data: StatsData | null;
  ts: number;
  promise: Promise<StatsData | null> | null;
}

const cache: CacheEntry = { data: null, ts: 0, promise: null };
const STALE_MS = 60_000; // 60 seconds

function fetchStats(): Promise<StatsData | null> {
  if (cache.promise) return cache.promise;

  cache.promise = fetch('/api/v1/stats')
    .then((res) => {
      if (!res.ok) return cache.data;
      return res.json();
    })
    .then((d) => {
      if (d && typeof d === 'object') {
        const stats: StatsData = {
          verifiedAgents: d.verifiedAgents ?? 0,
          blocksVerified: d.blocksVerified ?? 0,
          genomesMinted: d.genomesMinted ?? 0,
        };
        cache.data = stats;
        cache.ts = Date.now();
        return stats;
      }
      return cache.data;
    })
    .catch(() => cache.data)
    .finally(() => {
      cache.promise = null;
    });

  return cache.promise;
}

export function useStats(refreshInterval = STALE_MS): StatsData | null {
  const [stats, setStats] = useState<StatsData | null>(cache.data);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const now = Date.now();
      if (now - cache.ts > STALE_MS || cache.data === null) {
        const data = await fetchStats();
        if (!cancelled) setStats(data);
      } else if (cache.data !== null) {
        if (!cancelled) setStats(cache.data);
      }
    }

    refresh();
    const iv = setInterval(refresh, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [refreshInterval]);

  return stats;
}
