/**
 * Block page v2 tokens (design pack tokens.md §1): the added colour tokens are
 * in globals.css, `.bp-dark` keeps the page dark under the light theme, every
 * text pair the page uses reads at 4.5:1 or better (WCAG 2.x formula, alpha
 * surfaces composited first), and the page's own files keep colour literals
 * out of `style` props and style maps.
 */

import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname, '..', '..');
const CSS = fs.readFileSync(path.join(APP, 'src', 'app', 'globals.css'), 'utf8');

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

function tokensOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const THEME = tokensOf(block('@theme'));
const DARK = tokensOf(block('.bp-dark'));

const ADDED: Record<string, string> = {
  '--color-surface-1': 'rgba(255, 255, 255, 0.028)',
  '--color-surface-2': 'rgba(255, 255, 255, 0.05)',
  '--color-surface-3': 'rgba(255, 255, 255, 0.085)',
  '--color-line-1': 'rgba(255, 255, 255, 0.07)',
  '--color-line-2': 'rgba(255, 255, 255, 0.12)',
  '--color-line-3': 'rgba(255, 255, 255, 0.2)',
  '--color-text-1': '#eef2f7',
  '--color-text-2': '#9ba7b9',
  '--color-text-3': '#7a869c',
  '--color-bitcoin-hi': '#ffa53a',
  '--color-bitcoin-ink': '#1a1206',
  '--color-ok-text': '#4ade80',
  '--color-warn': '#f59e0b',
  '--color-warn-text': '#fbbf24',
  '--color-warn-soft': 'rgba(245, 158, 11, 0.08)',
  '--color-warn-line': 'rgba(245, 158, 11, 0.26)',
  '--color-bad-text': '#fca5a5',
};

const DARK_VALUES: Record<string, string> = {
  '--color-bg-primary': '#0a0a0f',
  '--color-bg-secondary': '#12121a',
  '--color-text-primary': '#e2e8f0',
  '--color-text-secondary': '#94a3b8',
  '--color-text-muted': '#64748b',
  '--color-bitcoin': '#f7931a',
  '--color-accent-cyan': '#66ccff',
  '--color-success': '#22c55e',
  '--color-border': 'rgba(102, 204, 255, 0.1)',
  '--color-border-hover': 'rgba(102, 204, 255, 0.25)',
};

type RGB = [number, number, number];

function parse(v: string): { rgb: RGB; a: number } {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\s*\)$/);
  if (!m) throw new Error(`unparsed colour ${v}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
}

/** An alpha colour composited over an opaque one. */
function over(top: string, under: RGB): RGB {
  const { rgb, a } = parse(top);
  return rgb.map((c, i) => c * a + under[i] * (1 - a)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const v = (name: string) => THEME[name];
const BG = parse(v('--color-bg-primary')).rgb;
const SHEET = parse(v('--color-bg-secondary')).rgb;

/** The surfaces text sits on, each composited onto what is under it. */
const SURFACES: Record<string, RGB> = {
  'bg-primary': BG,
  'surface-1': over(v('--color-surface-1'), BG),
  'bg-secondary': SHEET,
};

/** The pairs the page uses, as listed in the brief (item 1). */
const TEXTS = ['--color-text-1', '--color-text-2', '--color-text-3', '--color-accent-cyan', '--color-ok-text', '--color-warn-text'];
const PAIRS: Array<[string, RGB, RGB]> = [
  ...TEXTS.flatMap((t) =>
    Object.entries(SURFACES).map(([s, rgb]) => [`${t} on ${s}`, parse(v(t)).rgb, rgb] as [string, RGB, RGB]),
  ),
  ['--color-warn-text on warn-soft', parse(v('--color-warn-text')).rgb, over(v('--color-warn-soft'), BG)],
  ['--color-text-1 on surface-3', parse(v('--color-text-1')).rgb, over(v('--color-surface-3'), BG)],
  ['--color-text-1 on surface-3 in a sheet', parse(v('--color-text-1')).rgb, over(v('--color-surface-3'), SHEET)],
  ['--color-bitcoin-ink on bitcoin', parse(v('--color-bitcoin-ink')).rgb, parse(v('--color-bitcoin')).rgb],
];

describe('block page tokens', () => {
  it('every added token is in @theme with its tokens.md value', () => {
    for (const [name, value] of Object.entries(ADDED)) expect([name, THEME[name]]).toEqual([name, value]);
  });

  it('no existing token was renamed or removed', () => {
    for (const name of Object.keys(DARK_VALUES)) expect(THEME[name]).toBe(DARK_VALUES[name]);
  });

  it('.bp-dark re-declares the dark value of the ten colour tokens the page uses', () => {
    expect(Object.keys(DARK_VALUES)).toHaveLength(10);
    for (const [name, value] of Object.entries(DARK_VALUES)) expect([name, DARK[name]]).toEqual([name, value]);
  });

  it('the added tokens have no light values', () => {
    const light = tokensOf(block('.light'));
    for (const name of Object.keys(ADDED)) expect(light).not.toHaveProperty(name);
  });

  it.each(PAIRS)('%s reads at 4.5:1 or better', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

const P = path.join(APP, 'src', 'app', '(site)', 'block', '[height]');
const UI = path.join(APP, 'src', 'components', 'ui');

/** The page's own files: the new ones and the restyled ones. */
const FILES = [
  ...['page.tsx', 'guardian-card.tsx', 'activity-feed.tsx', 'hero.tsx', 'block-art.tsx', 'deed-card.tsx', 'build-card.tsx', 'guardian-sheet.tsx', 'guardian-action.tsx', 'share-menu.tsx', 'phone-dock.tsx'].map(
    (f) => path.join(P, f),
  ),
  ...['chip.tsx', 'card.tsx', 'callout.tsx', 'empty.tsx', 'sheet.tsx', 'menu.tsx'].map((f) => path.join(UI, f)),
].filter((f) => fs.existsSync(f));

const LITERAL = /rgba?\(|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i;

/**
 * Data-driven colours are allowed: `GenomeStrip` colours each bar from the
 * block hash with `hexPairToColor`, so its `style` holds a variable, not a literal.
 */
const EXEMPT = ['backgroundColor: bar.color'];

describe('no colour literal in a style prop or a style map', () => {
  it('finds the page files', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(3);
    expect(FILES.map((f) => path.basename(f))).toContain('guardian-action.tsx');
  });

  it.each(FILES.map((f) => [path.relative(APP, f), f]))('%s', (_rel, file) => {
    const src = fs.readFileSync(file, 'utf8');
    const styles = [...src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
    for (const s of styles) {
      if (EXEMPT.some((e) => s.includes(e))) continue;
      expect(s).not.toMatch(LITERAL);
    }
    expect(src).not.toMatch(/Record<[^>]*CSSProperties>/);
  });
});
