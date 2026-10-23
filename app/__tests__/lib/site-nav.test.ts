/**
 * Navigation contract for the five-screen site: five primary destinations,
 * every link lands on a real page, and the search box understands the ways
 * people write a block number.
 */

import fs from 'fs';
import path from 'path';

import { PRIMARY_NAV, SECONDARY_NAV, isActivePath, parseBlockQuery, safeNextPath, searchResultHref, searchTerm } from '@/lib/site-nav';

const appDir = path.join(__dirname, '..', '..', 'src', 'app');
// Pages live in route groups ("(site)", "(landing)"), which add no URL segment.
const roots = ['', ...fs.readdirSync(appDir).filter((d) => /^\(.+\)$/.test(d))];
const hasPage = (href: string) =>
  roots.some((g) => fs.existsSync(path.join(appDir, g, ...href.split('/').filter(Boolean), 'page.tsx')));

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

  // REVIEW bg57 P2-10: the installed app's shortcuts still opened /profile and /verify.
  it('gives the installed app shortcuts to real pages only, none retired', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'manifest.json'), 'utf8'));
    const urls: string[] = manifest.shortcuts.map((s: { url: string }) => s.url);
    const retired = ['/portfolio', '/profile', '/verify', '/explorer', '/leaderboard'];

    expect(urls.filter((u) => retired.includes(u))).toEqual([]);
    expect(urls.filter((u) => !hasPage(u))).toEqual([]);
    expect(urls).toContain('/my-bitmaps');
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

describe('searchTerm (REVIEW bg57 P1-1: the box says "@handle", so "@handle" must find it)', () => {
  it.each([
    ['@elonmusk', 'elonmusk'],
    ['elonmusk', 'elonmusk'],
    ['  @pepe ', 'pepe'],
    ['@ pepe', 'pepe'],
    ['@@pepe', '@pepe'], // one "@" only
    ['840000.bitmap', '840000.bitmap'],
  ])('%j → %j', (raw, term) => {
    expect(searchTerm(raw)).toBe(term);
  });

  it.each(['@', ' @ ', '', '   '])('%j is empty: no request, no "No results"', (raw) => {
    expect(searchTerm(raw)).toBe('');
  });

  it('feeds the block shortcut the same term the request uses', () => {
    expect(parseBlockQuery(searchTerm('@840000'))).toBe(840000);
    expect(parseBlockQuery(searchTerm('@pepe'))).toBeNull();
  });
});

describe('searchResultHref (REVIEW bg57 P2-10)', () => {
  it('sends the API\'s retired /verify link straight to My Bitmaps', () => {
    expect(searchResultHref('/verify')).toBe('/my-bitmaps');
    expect(searchResultHref('/verify?block=720143')).toBe('/my-bitmaps');
  });

  it('leaves every other link alone', () => {
    for (const url of ['/agent/pepe', '/block/840000', '/verifyx', '/my-bitmaps']) expect(searchResultHref(url)).toBe(url);
  });
});

describe('safeNextPath (REVIEW bg57 P2-11: "//host" passed the post-connect check)', () => {
  it.each(['/my-bitmaps', '/account', '/block/840000?tab=world', '/'])('%s stays on this site', (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'my-bitmaps', '', undefined, null, 42])('%p is refused', (p) => {
    expect(safeNextPath(p)).toBeNull();
  });

  // REVIEW bg57-r2 P2-r2-1: the URL parser strips tabs and newlines, so these
  // are "//evil.example/x" to a browser.
  it.each(['/\t/evil.example/x', '/\n/evil.example/x', '/\r/evil.example/x', '/\t\\evil.example/x'])('%j is refused', (p) => {
    expect(new URL(p, 'https://blockgenomics.io').host).toBe('evil.example');
    expect(safeNextPath(p)).toBeNull();
  });
});
