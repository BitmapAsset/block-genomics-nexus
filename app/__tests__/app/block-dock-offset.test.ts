/**
 * The phone dock sits directly on top of the site's bottom tab bar (bg98p2
 * item 4). The dock's offset is written as `57px + the safe-area inset`; the
 * tab bar is 56 px items plus a 1 px top border, with the safe-area inset as
 * its bottom padding. If one of them changes without the other, the dock
 * would float above the bar or slide under it, so this test reads both and
 * keeps them in step.
 */

import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname, '..', '..');
const DOCK = fs.readFileSync(path.join(APP, 'src', 'app', '(site)', 'block', '[height]', 'phone-dock.tsx'), 'utf8');
const BAR = fs.readFileSync(path.join(APP, 'src', 'components', 'pwa', 'BottomTabBar.tsx'), 'utf8');

/** The class list of the tab bar's own `<nav aria-label="Primary">`. */
function navClasses(src: string): string {
  const nav = src.match(/<nav\s[^>]*aria-label="Primary"[^>]*>/);
  expect(nav).not.toBeNull();
  const cls = nav![0].match(/className="([^"]+)"/);
  expect(cls).not.toBeNull();
  return cls![1];
}

/** Tailwind border-top widths: `border-t` is 1 px, `border-t-2` is 2 px, and so on. */
function borderTop(classes: string): number {
  const m = classes.split(/\s+/).map((c) => c.match(/^border-t(?:-(\d+))?$/)).find(Boolean);
  if (!m) return 0;
  return m[1] ? Number(m[1]) : 1;
}

describe('the dock sits on the tab bar', () => {
  const dockOffset = DOCK.match(/bottom-\[calc\((\d+)px\+env\(safe-area-inset-bottom\)\)\]/);
  const itemHeights = [...BAR.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  const nav = navClasses(BAR);

  it('the dock is offset by a fixed height plus the safe-area inset', () => {
    expect(dockOffset).not.toBeNull();
    expect(Number(dockOffset![1])).toBe(57);
  });

  it('the tab bar is one row of items of one height, with a top border and no vertical padding of its own', () => {
    expect(itemHeights.length).toBeGreaterThan(0);
    expect(new Set(itemHeights).size).toBe(1);
    expect(borderTop(nav)).toBeGreaterThan(0);
    expect(nav).not.toMatch(/(^|\s)(p|py|pt|pb|h|min-h)-/);
    expect(nav).toMatch(/(^|\s)fixed(\s|$)/);
    expect(nav).toMatch(/(^|\s)bottom-0(\s|$)/);
  });

  it('the tab bar takes the safe-area inset as its bottom padding, which the dock adds the same way', () => {
    expect(BAR).toMatch(/paddingBottom:\s*"env\(safe-area-inset-bottom, 0px\)"/);
    expect(DOCK).toContain('env(safe-area-inset-bottom)');
  });

  it("the dock's offset equals the tab bar's item height plus its top border", () => {
    expect(Number(dockOffset![1])).toBe(itemHeights[0] + borderTop(nav));
  });
});
