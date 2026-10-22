import { unstable_cache } from 'next/cache';
import { readPublicStats, type PublicStats } from '@/lib/public-stats';

/** How long the server-rendered footer numbers may be reused. The client refreshes them live. */
export const FOOTER_STATS_REVALIDATE_S = 300;

/** Shared with /api/v1/stats, so the footer HTML and the API serve one cached read. */
export const cachedStats = unstable_cache(readPublicStats, ['footer-public-stats'], {
  revalidate: FOOTER_STATS_REVALIDATE_S,
});

/**
 * Footer counters for the server HTML, so a reader without JavaScript sees the
 * same numbers as /api/v1/stats instead of "—". Null when the database cannot
 * be read (e.g. a build without DATABASE_URL); the footer then shows "—" and
 * the client fetch fills it in, exactly as before.
 */
export async function getFooterStats(): Promise<PublicStats | null> {
  try {
    return await cachedStats();
  } catch {
    return null;
  }
}
