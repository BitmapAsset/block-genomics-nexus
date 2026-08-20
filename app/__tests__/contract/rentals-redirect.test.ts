/**
 * `/marketplace` was the parcel-rental page until that name was given to the
 * advisory third-party venue lane. The page now lives at `/rentals`, and the
 * old path is published in links we do not control, so the redirect is part of
 * the contract rather than a convenience.
 */

import fs from 'fs';
import path from 'path';

import nextConfig from '../../next.config';

const appDir = path.join(__dirname, '..', '..', 'src', 'app');

describe('/marketplace → /rentals', () => {
  it('redirects permanently', async () => {
    const redirects = await nextConfig.redirects!();
    const entry = redirects.find((r) => r.source === '/marketplace');

    expect(entry).toBeDefined();
    expect(entry!.destination).toBe('/rentals');
    expect(entry!.permanent).toBe(true);
  });

  it('serves the rentals page from /rentals and nothing from /marketplace', () => {
    expect(fs.existsSync(path.join(appDir, 'rentals', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'marketplace'))).toBe(false);
  });

  it('advertises the new path in the sitemap', async () => {
    const source = fs.readFileSync(path.join(appDir, 'sitemap.ts'), 'utf8');

    expect(source).toContain("path: '/rentals'");
    expect(source).not.toContain("path: '/marketplace'");
  });
});
