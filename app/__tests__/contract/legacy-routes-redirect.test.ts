/**
 * Old URLs are published in posts, docs and bookmarks we do not control, so
 * every route the five-screen rebuild retired must answer with a permanent
 * redirect to a page that exists, never a 404.
 */

import fs from 'fs';
import path from 'path';

import nextConfig from '../../next.config';

const appDir = path.join(__dirname, '..', '..', 'src', 'app');

/** Does a `src/app` page exist for this destination path (dynamic segments allowed)? */
function pageExists(dest: string): boolean {
  // Pages live in route groups ("(site)", "(landing)"), which add no URL segment.
  return ['', ...fs.readdirSync(appDir).filter((d) => /^\(.+\)$/.test(d))].some((g) =>
    pageExistsUnder(path.join(appDir, g), dest),
  );
}

function pageExistsUnder(root: string, dest: string): boolean {
  const clean = dest.split(/[?#]/)[0];
  const parts = clean.split('/').filter(Boolean);
  let dir = root;
  for (const part of parts) {
    if (part.startsWith(':')) {
      if (!fs.existsSync(dir)) return false;
      const dyn = fs.readdirSync(dir).find((d) => /^\[[^\]]+\]$/.test(d));
      if (!dyn) return false;
      dir = path.join(dir, dyn);
    } else {
      dir = path.join(dir, part);
    }
  }
  return fs.existsSync(path.join(dir, 'page.tsx'));
}

const EXPECTED: Array<[string, string]> = [
  ['/nexus/parcel/:height', '/world/:height'],
  // The three owner dashboards merged into My Bitmaps.
  ['/portfolio', '/my-bitmaps'],
  ['/profile', '/my-bitmaps'],
  ['/verify', '/my-bitmaps'],
  // Duplicate block browsers merged into Explore.
  ['/explorer', '/explore'],
  ['/leaderboard', '/explore'],
  // Guessed paths from the audit's 404 list.
  ['/world', '/nexus'],
  ['/agents', '/directory'],
  ['/guardians', '/my-bitmaps'],
  ['/badges', '/account'],
  ['/sdk', '/docs'],
  ['/whitepaper.html', '/whitepaper'],
];

describe('legacy routes redirect', () => {
  it.each(EXPECTED)('%s → %s with a 301', async (source, destination) => {
    const redirects = await nextConfig.redirects!();
    const entry = redirects.find((r) => r.source === source);

    expect(entry).toBeDefined();
    expect(entry!.destination).toBe(destination);
    expect('statusCode' in entry! ? entry!.statusCode : undefined).toBe(301);
  });

  it('points every redirect at a page that exists', async () => {
    const redirects = await nextConfig.redirects!();
    const missing = redirects.filter((r) => !pageExists(r.destination)).map((r) => `${r.source} → ${r.destination}`);

    expect(missing).toEqual([]);
  });

  it('leaves no page behind at a redirected path (it could never be reached)', async () => {
    const redirects = await nextConfig.redirects!();
    const shadowed = redirects
      .filter((r) => !r.source.includes(':'))
      .filter((r) => fs.existsSync(path.join(appDir, ...r.source.split('/').filter(Boolean), 'page.tsx')))
      .map((r) => r.source);

    expect(shadowed).toEqual([]);
  });

  it('does not redirect /docs/sdk: the SDK reference lives there now', async () => {
    const redirects = await nextConfig.redirects!();

    expect(redirects.find((r) => r.source === '/docs/sdk')).toBeUndefined();
    expect(fs.existsSync(path.join(appDir, '(site)', 'docs', 'sdk', 'page.tsx'))).toBe(true);
  });

  it('removed the pages it redirects away from', () => {
    for (const dir of ['portfolio', 'profile', 'verify', 'explorer', 'leaderboard']) {
      expect(fs.existsSync(path.join(appDir, dir))).toBe(false);
    }
  });

  it('keeps the redirect sources out of the sitemap', () => {
    const source = fs.readFileSync(path.join(appDir, 'sitemap.ts'), 'utf8');
    for (const p of ['/verify', '/leaderboard', '/portfolio', '/explorer', '/profile']) {
      expect(source).not.toContain(`path: '${p}'`);
    }
  });

  it('serves the world from /world/[height] and no longer from /nexus/parcel', () => {
    expect(fs.existsSync(path.join(appDir, '(site)', 'world', '[height]', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, '(site)', 'nexus', 'parcel'))).toBe(false);
  });
});
