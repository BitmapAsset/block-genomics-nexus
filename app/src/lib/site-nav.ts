import { MAX_BLOCK_HEIGHT } from '@/lib/block-height';

/**
 * The site's navigation, in one place, so the header, the mobile menu, the
 * mobile tab bar and the footer cannot drift apart.
 *
 * Five primary destinations (Explore · My Bitmaps · World · Developers ·
 * Account). The block page is reached from search and from every grid, not
 * from the bar. Everything else is secondary and lives in the footer and the
 * mobile menu.
 */

export interface NavItem {
  href: string;
  label: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/explore', label: 'Explore' },
  { href: '/my-bitmaps', label: 'My Bitmaps' },
  { href: '/nexus', label: 'World' },
  { href: '/docs', label: 'Developers' },
  { href: '/account', label: 'Account' },
];

/** Reachable, but not primary: footer and the "More" group of the mobile menu. */
export const SECONDARY_NAV: NavItem[] = [
  { href: '/directory', label: 'Agent directory' },
  { href: '/rentals', label: 'Rentals' },
  { href: '/live', label: 'TimesSquare' },
  { href: '/history', label: 'History' },
  { href: '/runebolt', label: 'RuneBolt' },
  { href: '/brain', label: 'Brain' },
  { href: '/whitepaper', label: 'White paper' },
  { href: '/protocol', label: 'Protocol' },
];

/** Paths that light up a primary item besides its own href. */
const ALSO_ACTIVE: Record<string, string[]> = {
  '/nexus': ['/world'],
  '/explore': ['/block'],
};

/** True when `pathname` is `href` or lives under it (or under one of its aliases). */
export function isActivePath(pathname: string, href: string): boolean {
  const roots = [href, ...(ALSO_ACTIVE[href] ?? [])];
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * A same-site path to go to after connecting, or null. "//host" and "/\\host"
 * are other sites to a browser, so only a single leading "/" counts.
 */
export function safeNextPath(next: unknown): string | null {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null;
}

/**
 * Where a search result goes. The search API still links a handle-less user
 * or agent to the retired `/verify`, which only redirects to My Bitmaps; go
 * there directly. The API's answer is left as it is (contract unchanged).
 */
export function searchResultHref(url: string): string {
  return url === '/verify' || url.startsWith('/verify?') || url.startsWith('/verify/') ? '/my-bitmaps' : url;
}

/**
 * What the search box sends: the text as typed, trimmed, with one leading "@"
 * dropped. The box invites "@handle", but handles are stored without the "@"
 * and the search API matches them as stored, so "@pepe" used to find nothing.
 * "@" alone leaves an empty term, which means no request at all.
 */
export function searchTerm(raw: string): string {
  return raw.trim().replace(/^@/, '').trim();
}

/**
 * A search box entry that names one block, in any common spelling:
 * "840000", "840,000", "#840000", "840000.bitmap", "0". Null otherwise.
 */
export function parseBlockQuery(raw: string): number | null {
  const q = raw.trim().replace(/^#/, '').replace(/\.bitmap$/i, '').replace(/[,_\s]/g, '');
  if (!/^\d{1,8}$/.test(q)) return null;
  const n = Number(q);
  return Number.isSafeInteger(n) && n <= MAX_BLOCK_HEIGHT ? n : null;
}
