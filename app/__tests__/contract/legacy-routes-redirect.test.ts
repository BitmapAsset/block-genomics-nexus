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
  const clean = dest.split(/[?#]/)[0];
  const parts = clean.split('/').filter(Boolean);
  let dir = appDir;
  for (const part of parts) {
    if (part.startsWith(':')) {
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

  it('serves the world from /world/[height] and no longer from /nexus/parcel', () => {
    expect(fs.existsSync(path.join(appDir, 'world', '[height]', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'nexus', 'parcel'))).toBe(false);
  });
});
