/**
 * QA 2026-10-22 #11 and the bg86 ship finding: the root layout picked the
 * landing chrome on the client with `usePathname() === "/"`. Whenever the
 * server saw another pathname for "/" (the landing's ISR regeneration in
 * production), the server HTML carried the site chrome, the client rendered
 * the landing chrome, and React threw #418. Crawlers and no-JS visitors saw
 * the wrong nav.
 *
 * The chrome is now decided by the route tree on the server: the (landing)
 * group renders the landing chrome, the (site) group and the root not-found
 * render the site chrome, and nothing chooses by pathname.
 */

import fs from 'fs';
import path from 'path';

const src = path.join(__dirname, '..', '..', 'src');
const appDir = path.join(src, 'app');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');

function pages(dir: string, found: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) pages(full, found);
    else if (e.name === 'page.tsx') found.push(path.relative(appDir, full));
  }
  return found;
}

describe('page chrome is chosen on the server', () => {
  it('serves "/" from the (landing) group, and only "/"', () => {
    expect(pages(path.join(appDir, '(landing)'))).toEqual([path.join('(landing)', 'page.tsx')]);
    expect(fs.existsSync(path.join(appDir, 'page.tsx'))).toBe(false);
  });

  it('puts every other page in the (site) group', () => {
    const outside = pages(appDir).filter((p) => !p.startsWith('(landing)') && !p.startsWith('(site)'));
    expect(outside).toEqual([]);
  });

  it('gives the landing its own chrome in the (landing) layout', () => {
    const layout = read(appDir, '(landing)', 'layout.tsx');
    for (const c of ['LandingHeader', 'LandingFooter', 'LandingBottomTabBar', 'OnboardingFlow']) expect(layout).toContain(`<${c}`);
    expect(layout).not.toMatch(/from ['"]next\/navigation['"]|<Header\b|<Footer\b/);
  });

  it('gives every other page, and the 404 page, the site chrome', () => {
    expect(read(appDir, '(site)', 'layout.tsx')).toContain('<SiteChrome>');
    expect(read(appDir, 'not-found.tsx')).toContain('<SiteChrome>');
    const chrome = read(src, 'components', 'SiteChrome.tsx');
    for (const c of ['Header', 'Footer', 'BottomTabBar']) expect(chrome).toContain(`<${c}`);
    expect(chrome).not.toMatch(/from ['"]next\/navigation['"]|from ['"]@\/components\/landing\//);
  });

  it('catches notFound() from (site) pages inside the chrome, not in its error boundary', () => {
    // SiteChrome wraps pages in an ErrorBoundary. The root not-found boundary
    // sits outside it, so without a (site) not-found the boundary caught
    // notFound() from /block/abc and showed "Something went wrong".
    expect(read(appDir, '(site)', 'not-found.tsx')).toContain('<NotFoundContent />');
    expect(read(appDir, '(site)', 'not-found.tsx')).not.toContain('<SiteChrome>');
  });

  it('keeps the root layout free of chrome and of any pathname switch', () => {
    const root = read(appDir, 'layout.tsx');
    expect(root).not.toMatch(/RouteChrome|<Header\b|<Footer\b|BottomTabBar|from ['"]@\/components\/landing\/|from ['"]next\/navigation['"]/);
    expect(fs.existsSync(path.join(src, 'components', 'landing', 'RouteChrome.tsx'))).toBe(false);
  });
});
