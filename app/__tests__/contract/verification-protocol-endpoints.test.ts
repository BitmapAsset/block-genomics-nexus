/**
 * REVIEW-bg87 item 9: "docs/VERIFICATION-PROTOCOL.md:146 lists
 * GET /api/v1/verify/{agentId}, a route that exists neither on main nor on the
 * branch. Fix the docs line in a later wave."
 *
 * Every line of the doc's "Public API Endpoints" block must name a route this
 * app serves, with that method. A `{param}` segment matches a dynamic
 * `[param]` directory; a trailing `.svg` on the last segment is part of the id.
 */

import fs from 'fs';
import path from 'path';

const APP_ROOT = process.cwd();
const API_ROOT = path.join(APP_ROOT, 'src', 'app');
const DOC = path.join(APP_ROOT, '..', 'docs', 'VERIFICATION-PROTOCOL.md');

function endpointLines(): string[] {
  const md = fs.readFileSync(DOC, 'utf8');
  const section = md.split('## Public API Endpoints')[1];
  if (!section) throw new Error('no "## Public API Endpoints" section');
  const block = section.split('```')[1];
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(GET|POST|PUT|PATCH|DELETE)/.test(l));
}

/** The route.ts that serves `urlPath`, or null. */
function routeFileFor(urlPath: string): string | null {
  const segments = urlPath.replace(/\?.*$/, '').split('/').filter(Boolean);
  let dir = API_ROOT;
  for (const seg of segments) {
    const exact = path.join(dir, seg);
    if (!seg.startsWith('{') && fs.existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = fs.readdirSync(dir).find((d) => /^\[[^.\]]+\]$/.test(d));
    if (!dynamic) return null;
    dir = path.join(dir, dynamic);
  }
  const file = path.join(dir, 'route.ts');
  return fs.existsSync(file) ? file : null;
}

const lines = endpointLines();

it('lists endpoints', () => {
  expect(lines.length).toBeGreaterThan(5);
});

it.each(lines)('%s is served', (line) => {
  const [methods, urlPath] = line.split(/\s+/);
  const file = routeFileFor(urlPath);
  expect(file).not.toBeNull();
  const src = fs.readFileSync(file as string, 'utf8');
  for (const method of methods.split('/')) {
    expect(src).toMatch(new RegExp(`export (async )?function ${method}\\b`));
  }
});
