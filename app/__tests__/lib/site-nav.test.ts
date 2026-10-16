/**
 * Navigation contract for the five-screen site: five primary destinations,
 * every link lands on a real page, and the search box understands the ways
 * people write a block number.
 */

import fs from 'fs';
import path from 'path';

import { PRIMARY_NAV, SECONDARY_NAV, isActivePath, parseBlockQuery } from '@/lib/site-nav';

const appDir = path.join(__dirname, '..', '..', 'src', 'app');
const hasPage = (href: string) => fs.existsSync(path.join(appDir, ...href.split('/').filter(Boolean), 'page.tsx'));

describe('site navigation', () => {
  it('has exactly five primary destinations', () => {
    expect(PRIMARY_NAV.map((l) => l.label)).toEqual(['Explore', 'My Bitmaps', 'World', 'Developers', 'Account']);
  });

  it('links only to pages that exist', () => {
    const missing = [...PRIMARY_NAV, ...SECONDARY_NAV].filter((l) => !hasPage(l.href)).map((l) => l.href);
    expect(missing).toEqual([]);
  });

  it('never links to a retired route', () => {
    const retired = ['/portfolio', '/profile', '/verify', '/explorer', '/leaderboard'];
    for (const l of [...PRIMARY_NAV, ...SECONDARY_NAV]) expect(retired).not.toContain(l.href);
  });

  it('marks a section active on its own path and below it', () => {
    expect(isActivePath('/my-bitmaps', '/my-bitmaps')).toBe(true);
    expect(isActivePath('/docs/experience-hosting', '/docs')).toBe(true);
    expect(isActivePath('/documents', '/docs')).toBe(false);
  });

  it('keeps World lit inside a block world and Explore lit on a block page', () => {
    expect(isActivePath('/world/840000', '/nexus')).toBe(true);
    expect(isActivePath('/block/840000', '/explore')).toBe(true);
    expect(isActivePath('/block/840000', '/nexus')).toBe(false);
  });
});

describe('parseBlockQuery', () => {
  it.each([
    ['840000', 840000],
    ['840,000', 840000],
    ['#840000', 840000],
    ['840000.bitmap', 840000],
    ['  720143.BITMAP ', 720143],
    ['0', 0],
    ['0.bitmap', 0],
  ])('%s → %i', (q, h) => {
    expect(parseBlockQuery(q)).toBe(h);
  });

  it.each(['pepe', '@pepe', 'bc1pxyz', '840000:3.bitmap', '-1', '1.5', '', '99999999999'])('%s → null', (q) => {
    expect(parseBlockQuery(q)).toBeNull();
  });
});
