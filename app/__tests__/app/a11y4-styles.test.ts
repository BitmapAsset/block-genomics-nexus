/**
 * Stylesheet and source checks for three small reading and focus fixes:
 * - on phones, while the block page's dock shows above the tab bar, a focused item stops above the dock too;
 * - the `/live` tab counts are drawn at full strength, not faded;
 * - the docs' tone badges, HTTP method labels, inline code and title gradient read their colours from CSS variables
 *   that have a dark value (today's) and a light value of their own, so they stay readable in the light theme.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP = path.join(__dirname, '../../src/app');
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), 'utf8');
// Comments removed, so a note above a rule does not hide the rule from the checks below.
const css = read('globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `selector { ... }` block at the top level of `text` (or inside `text`), braces balanced. */
function blockBody(text: string, opener: RegExp): string | null {
  const m = opener.exec(text);
  if (!m) return null;
  let i = text.indexOf('{', m.index + m[0].length - 1);
  if (i < 0) return null;
  const start = i + 1;
  let depth = 1;
  for (i = start; i < text.length && depth > 0; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return text.slice(start, i - 1);
}

/** Every top-level `selector { ... }` block whose selector list is exactly `selector`. */
function rulesFor(text: string, selector: string): string[] {
  const out: string[] = [];
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\})\\s*${esc}\\s*\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = blockBody(text.slice(m.index), new RegExp(`${esc}\\s*\\{`));
    if (body !== null) out.push(body);
  }
  return out;
}

function definedIn(bodies: string[]): Set<string> {
  const names = new Set<string>();
  for (const b of bodies) for (const m of b.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) names.add(m[1]);
  return names;
}

describe('phone dock: focus stops above it', () => {
  it('the phone media block pads the bottom by the tab bar and the dock while the dock is in the page', () => {
    const phone = blockBody(css, /@media\s*\(max-width:\s*767\.98px\)\s*\{/);
    expect(phone).not.toBeNull();
    const rule = blockBody(phone as string, /html:has\(\[data-testid="phone-dock"\]\)\s*\{/);
    expect(rule).not.toBeNull();
    expect((rule as string).replace(/\s+/g, ' ').trim()).toMatch(
      /^scroll-padding-bottom: calc\(143px \+ env\(safe-area-inset-bottom, 0px\)\);?$/,
    );
  });

  it('the tab bar padding of every other phone page stays as it was', () => {
    const phone = blockBody(css, /@media\s*\(max-width:\s*767\.98px\)\s*\{/) as string;
    const html = blockBody(phone, /(^|\})\s*html\s*\{/);
    expect(html).not.toBeNull();
    expect(html as string).toMatch(/scroll-padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});

describe('/live tab counts', () => {
  // A source check: the page is a client component that fetches on mount; the count span is one line.
  it('the count beside each tab label is not faded', () => {
    const src = read('(site)/live/page.tsx');
    const span = src.match(/<span className="([^"]*)">\{t\.count\}<\/span>/);
    expect(span).not.toBeNull();
    const classes = (span as RegExpMatchArray)[1].split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['ml-1', 'text-xs']));
    expect(classes.filter((c) => /^opacity-/.test(c))).toEqual([]);
  });
});

describe('docs colours in both themes', () => {
  const DOC_VARS = [
    '--doc-tone-cyan',
    '--doc-tone-bitcoin',
    '--doc-tone-purple',
    '--doc-method-get',
    '--doc-method-post',
    '--doc-method-delete',
    '--doc-method-other',
    '--doc-code-text',
    '--doc-title-1',
    '--doc-title-2',
    '--doc-title-3',
    '--doc-title-4',
  ];

  it('each docs colour has a dark value on :root and a light value under .light', () => {
    const dark = definedIn(rulesFor(css, ':root'));
    const light = definedIn(rulesFor(css, '.light'));
    expect(DOC_VARS.filter((v) => !dark.has(v))).toEqual([]);
    expect(DOC_VARS.filter((v) => !light.has(v))).toEqual([]);
  });

  it('the light values come after the dark ones, so they win under .light', () => {
    const rootAt = css.search(/(^|\})\s*:root\s*\{[^}]*--doc-tone-cyan/);
    const lightAt = css.search(/(^|\})\s*\.light\s*\{[^}]*--doc-tone-cyan/);
    expect(rootAt).toBeGreaterThanOrEqual(0);
    expect(lightAt).toBeGreaterThan(rootAt);
  });

  it('the dark values are the colours the docs used before', () => {
    const body = rulesFor(css, ':root').join('\n');
    const val = (v: string) => (body.match(new RegExp(`${v}\\s*:\\s*([^;]+);`)) || [])[1]?.trim().toLowerCase();
    expect(val('--doc-tone-cyan')).toBe('#66ccff');
    expect(val('--doc-tone-bitcoin')).toBe('#f7931a');
    expect(val('--doc-tone-purple')).toBe('#c9a5f7');
    expect(val('--doc-method-get')).toBe('#66ccff');
    expect(val('--doc-method-post')).toBe('#4ade80');
    expect(val('--doc-method-delete')).toBe('#ff6b6b');
    expect(val('--doc-method-other')).toBe('#f7931a');
    expect(val('--doc-code-text')).toBe('#cfe8ff');
    expect(val('--doc-title-1')).toBe('#66ccff');
    expect(val('--doc-title-2')).toBe('#ffffff');
    expect(val('--doc-title-3')).toBe('#a855f7');
    expect(val('--doc-title-4')).toBe('#f7931a');
  });

  it('.doc-inline-code reads its text colour from the variable', () => {
    const body = rulesFor(css, '.doc-inline-code').join('\n');
    expect(body).toMatch(/(^|[\s;])color:\s*var\(--doc-code-text\)/);
  });

  it.each([['(site)/docs/DocParts.tsx'], ['(site)/docs/experience-hosting/page.tsx']])(
    '%s: tone badges and method labels use the variables, with no fixed dark-theme colour left',
    (file) => {
      const src = read(file);
      for (const tone of ['cyan', 'bitcoin', 'purple']) {
        expect(src).toMatch(new RegExp(`${tone}: \\{[^}]*fg: 'var\\(--doc-tone-${tone}\\)'`));
      }
      const method = src.match(/function methodColor\(m: string\): string \{([\s\S]*?)\n\}/);
      expect(method).not.toBeNull();
      const body = (method as RegExpMatchArray)[1];
      for (const v of ['get', 'post', 'delete', 'other']) expect(body).toContain(`var(--doc-method-${v})`);
      expect(body).not.toMatch(/#[0-9a-f]{6}/i);
    },
  );

  it('the code block file-name label keeps a fixed light grey, because the code panel and its strip stay dark in both themes', () => {
    const src = read('(site)/docs/CodeBlock.tsx');
    const label = src.match(/<span className="font-mono text-xs" style=\{\{ color: ([^}]*) \}\}>\s*\{title \?\? lang\}/);
    expect(label).not.toBeNull();
    expect((label as RegExpMatchArray)[1].trim()).toBe("'#94a3b8'");
    expect(src).toMatch(/background: '#0c0c14'/);
  });

  it.each([['(site)/docs/page.tsx'], ['(site)/docs/experience-hosting/page.tsx']])(
    '%s: the title gradient is drawn from the variables',
    (file) => {
      const src = read(file);
      const grad = src.match(/background: '(linear-gradient\(135deg,[^']*)'/);
      expect(grad).not.toBeNull();
      const g = (grad as RegExpMatchArray)[1];
      for (const n of [1, 2, 3, 4]) expect(g).toContain(`var(--doc-title-${n})`);
      expect(g).not.toMatch(/#[0-9a-f]{6}/i);
    },
  );
});
