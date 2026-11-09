/**
 * Every CSS custom property the app reads with `var(--name)` is defined somewhere in the app: in a stylesheet
 * (`--name: ...`), in an inline style object (`'--name': ...`), through `style.setProperty('--name', ...)`, or as a
 * next/font `variable`. A name that is never defined makes the whole declaration invalid, so the element silently loses
 * that colour or size. Names the framework writes itself (Tailwind's `--tw-*`) are allowed.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../../src');
const FRAMEWORK_PREFIXES = ['--tw-'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(css|ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scan() {
  const used = new Map<string, Set<string>>();
  const defined = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC, file);
    for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1])!.add(rel);
    }
    for (const m of text.matchAll(/(?:^|[^A-Za-z0-9_(-])(--[A-Za-z0-9_-]+)\s*:/gm)) defined.add(m[1]);
    for (const m of text.matchAll(/['"`](--[A-Za-z0-9_-]+)['"`]\s*:/g)) defined.add(m[1]);
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g)) defined.add(m[1]);
    for (const m of text.matchAll(/variable:\s*['"`](--[A-Za-z0-9_-]+)/g)) defined.add(m[1]);
  }
  return { used, defined };
}

describe('CSS custom properties', () => {
  it('finds the stylesheet tokens it is meant to check', () => {
    const { used, defined } = scan();
    expect(defined.has('--color-bg-primary')).toBe(true);
    expect(defined.has('--color-border')).toBe(true);
    expect(used.size).toBeGreaterThan(5);
  });

  it('every var(--name) used in app/src is defined in app/src', () => {
    const { used, defined } = scan();
    const missing = [...used.keys()]
      .filter((name) => !defined.has(name))
      .filter((name) => !FRAMEWORK_PREFIXES.some((p) => name.startsWith(p)))
      .sort()
      .map((name) => `${name} (${[...used.get(name)!].sort().join(', ')})`);
    expect(missing).toEqual([]);
  });
});
