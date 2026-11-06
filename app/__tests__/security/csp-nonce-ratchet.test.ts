/**
 * Every page stays on the per-request nonce path. The report-only policy (and a
 * later enforced one) trusts a script only if it carries this request's nonce,
 * and a page gets that nonce only when it renders per request. Three source
 * checks keep that true as pages are added:
 *
 * 1. no page.tsx / layout.tsx under src/app opts back into static rendering
 *    with `dynamic = 'force-static'` (a prerendered page has no nonce);
 * 2. the root layout awaits connection(), which is what makes every page
 *    render per request;
 * 3. every hand-written <script> element in src passes a `nonce` (Next adds it
 *    to its own scripts; ours must pass it themselves, like JsonLd).
 *
 * Route handlers (route.ts) are not pages and may stay static.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const APP = path.join(SRC, 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

/** Source without comments (block and line), so a comment that mentions <script> is not a tag. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/** The opening tag text from `<script` up to its closing `>`, skipping `>` inside `{...}` expressions. */
function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

const FORCE_STATIC = /export\s+const\s+dynamic\s*(?::[^=]+)?=\s*(['"`])force-static\1/;

describe('every page stays on the per-request nonce path', () => {
  const routeFiles = walk(APP).filter((f) => /^(page|layout)\.(tsx|ts|jsx|js)$/.test(path.basename(f)));

  it('scans the pages and layouts', () => {
    expect(routeFiles.length).toBeGreaterThan(20);
    expect(routeFiles.map(rel)).toContain(path.join('app', 'layout.tsx'));
  });

  it("no page or layout exports dynamic = 'force-static'", () => {
    const offenders = routeFiles.filter((f) => FORCE_STATIC.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the force-static check matches every quote style', () => {
    for (const q of [`'`, `"`, '`']) {
      expect(FORCE_STATIC.test(`export const dynamic = ${q}force-static${q};`)).toBe(true);
    }
    expect(FORCE_STATIC.test(`export const dynamic: string = 'force-static';`)).toBe(true);
    expect(FORCE_STATIC.test(`export const dynamic = 'force-dynamic';`)).toBe(false);
  });

  it('the root layout awaits connection()', () => {
    const layout = stripComments(fs.readFileSync(path.join(APP, 'layout.tsx'), 'utf8'));
    expect(layout).toMatch(/import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s*['"]next\/server['"]/);
    expect(layout).toMatch(/await\s+connection\(\s*\)/);
  });

  it('every <script> element in src passes a nonce', () => {
    const jsx = walk(SRC).filter((f) => /\.(tsx|jsx)$/.test(f) && !/\.test\.(tsx|jsx)$/.test(f));
    const found: string[] = [];
    const missing: string[] = [];
    for (const f of jsx) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<script(?=[\s>/])/g)) {
        const tag = openingTag(src, m.index!);
        found.push(rel(f));
        if (!/\snonce\s*=/.test(tag)) missing.push(`${rel(f)}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(1); // today: components/seo/JsonLd.tsx
    expect(found).toContain(path.join('components', 'seo', 'JsonLd.tsx'));
    expect(missing).toEqual([]);
  });

  it('the script check flags a script without a nonce', () => {
    const sample = stripComments(`// a <script> in a comment\nconst a = <script type="x" dangerouslySetInnerHTML={{ __html: "a>b" }} />;`);
    const tags = [...sample.matchAll(/<script(?=[\s>/])/g)].map((m) => openingTag(sample, m.index!));
    expect(tags).toHaveLength(1);
    expect(/\snonce\s*=/.test(tags[0])).toBe(false);
    expect(tags[0]).toContain('__html');
  });
});
