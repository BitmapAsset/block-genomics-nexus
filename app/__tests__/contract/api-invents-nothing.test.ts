/**
 * An API route is the surface an agent programs against and a dashboard prints
 * verbatim. A random number reaching one of them is worse than a missing field:
 * a missing field is visibly missing, while `Math.floor(Math.random() * 451) +
 * 50` renders as "👥 Total Visitors — 312" and nobody questions it. That exact
 * line shipped in empire-stats and fed two dashboards.
 *
 * This is a source guard for the same reason `parcel-view-no-invented-data` is:
 * the failure is textual, so reading the text catches it, and it catches the
 * next one before it has a chance to be believed.
 *
 * Randomness is legitimate in a route — nonces, ids, jitter — so this does not
 * ban the call outright. It requires that every use be named in the allowlist
 * below with the reason it is not a claim about the world. An unlisted use
 * fails, which puts the burden on the author to say what the number means.
 */

import fs from 'fs';
import path from 'path';

const API_ROOT = path.join(__dirname, '..', '..', 'src', 'app', 'api');

/** Route file → why randomness there is not a fabricated fact. */
const RANDOMNESS_ALLOWED: Record<string, string> = {};

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });
}

/** Offending CODE lines only — a comment describing a removed fabrication is the point of the comment. */
function randomnessIn(file: string): string[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ n: i + 1, line: line.trim() }))
    .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
    .filter(({ line }) => /Math\.random|seededRandom/.test(line))
    .map(({ n, line }) => `${n}: ${line}`);
}

describe('API routes do not invent the numbers they serve', () => {
  it('has no unaccounted randomness under src/app/api', () => {
    const offenders = routeFiles(API_ROOT)
      .map((file) => ({ rel: path.relative(API_ROOT, file), hits: randomnessIn(file) }))
      .filter(({ rel, hits }) => hits.length > 0 && !(rel in RANDOMNESS_ALLOWED))
      .map(({ rel, hits }) => `${rel} → ${hits.join(' | ')}`);

    expect(offenders).toEqual([]);
  });

  it('serves no visitor count, because nothing in the schema records a visit', () => {
    // PageView is never written by the app and GuardianAgent.totalVisitors is
    // only ever reset to zero, so any lifetime "visitors" figure this route
    // returned would have to be manufactured.
    const empireStats = fs.readFileSync(
      path.join(API_ROOT, 'v1', 'profiles', 'empire-stats', '[address]', 'route.ts'),
      'utf8',
    );
    const returned = empireStats
      .slice(empireStats.lastIndexOf('return success('))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(returned).not.toMatch(/totalVisitors/);
  });
});
