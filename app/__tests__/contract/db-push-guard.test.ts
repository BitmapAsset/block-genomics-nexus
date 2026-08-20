/**
 * `npm run db:push` must be impossible to point at a remote database.
 *
 * `prisma db push` writes schema.prisma straight into a database and records
 * no migration, so anything it creates is invisible to `prisma migrate deploy`.
 * Run against the hosted project it produces the failure #128 had to repair
 * with a corrective baseline: a migration chain that no longer describes the
 * database, and a repo nobody can stand up from scratch.
 *
 * The guard is asserted by executing the real script, not by re-testing a copy
 * of its logic -- the thing that must hold is that `npm run db:push` refuses,
 * and only running it proves that.
 *
 * The allowed cases stop before `prisma db push` itself would run: the script
 * is invoked with `--help`, so a permitted host proves the guard let it through
 * without this suite needing a live database.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const APP_ROOT = process.cwd();
const GUARD = path.join(APP_ROOT, 'scripts', 'db-push-guard.mjs');

interface RunResult {
  status: number;
  output: string;
}

function runGuard(env: Record<string, string | undefined>, args: string[] = []): RunResult {
  // Start from a clean environment so an ambient DATABASE_* on the developer's
  // machine cannot decide the result of a test.
  const stripped = new Set(['DATABASE_POSTGRES_PRISMA_URL', 'DATABASE_POSTGRES_URL_NON_POOLING', 'NODE_ENV']);
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !stripped.has(k)));

  try {
    const out = execFileSync('node', [GUARD, ...args], {
      cwd: APP_ROOT,
      env: { ...base, ...env } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output: out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:5432/bgnexus?schema=public';

describe('npm run db:push is wired to the guard', () => {
  it('does not invoke `prisma db push` directly', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // The whole point: no script in this package may reach `db push` unguarded.
    const unguarded = Object.entries(pkg.scripts).filter(
      ([, cmd]) => /prisma\s+db\s+push/.test(cmd) && !cmd.includes('db-push-guard')
    );
    expect(unguarded).toEqual([]);
    expect(pkg.scripts['db:push']).toContain('db-push-guard.mjs');
  });
});

describe('the guard refuses a database it must never write to', () => {
  it.each([
    ['a Neon host', 'postgresql://u:p@ep-cool-name-123456.us-east-1.aws.neon.tech/neondb?sslmode=require'],
    ['a Supabase host', 'postgresql://postgres:p@db.abcdefghijkl.supabase.co:5432/postgres'],
    ['a bare remote IP', 'postgresql://u:p@146.190.125.67:5432/bgnexus'],
    ['a pooler hostname', 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres'],
  ])('refuses %s', (_label, url) => {
    const res = runGuard({ DATABASE_POSTGRES_PRISMA_URL: url });

    expect(res.status).toBe(1);
    expect(res.output).toContain('non-local host');
  });

  it('refuses when only the non-pooling URL is remote', () => {
    // db push uses directUrl; a local pooled URL beside a remote direct URL is
    // the configuration most likely to look safe and not be.
    const res = runGuard({
      DATABASE_POSTGRES_PRISMA_URL: LOCAL,
      DATABASE_POSTGRES_URL_NON_POOLING: 'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/neondb',
    });

    expect(res.status).toBe(1);
    expect(res.output).toContain('non-local host');
  });

  it('refuses when no database is configured, rather than falling through', () => {
    const res = runGuard({});

    expect(res.status).toBe(1);
    expect(res.output).toContain('no database configured');
  });

  it('refuses under NODE_ENV=production even on a local host', () => {
    const res = runGuard({ DATABASE_POSTGRES_PRISMA_URL: LOCAL, NODE_ENV: 'production' });

    expect(res.status).toBe(1);
    expect(res.output).toContain('NODE_ENV=production');
  });

  it('never echoes the connection string it rejected', () => {
    const res = runGuard({
      DATABASE_POSTGRES_PRISMA_URL: 'postgresql://admin:sup3rs3cret@ep-x.us-east-1.aws.neon.tech/neondb',
    });

    expect(res.output).not.toContain('sup3rs3cret');
    expect(res.output).not.toContain('admin:');
  });

  it('points at the migration workflow instead of just failing', () => {
    const res = runGuard({ DATABASE_POSTGRES_PRISMA_URL: 'postgresql://u:p@ep-x.neon.tech/neondb' });

    expect(res.output).toContain('prisma migrate dev');
  });
});

describe('the guard still allows local development', () => {
  it.each([
    ['127.0.0.1', LOCAL],
    ['localhost', 'postgresql://postgres:postgres@localhost:5432/bgnexus'],
    ['an IPv6 loopback', 'postgresql://postgres:postgres@[::1]:5432/bgnexus'],
  ])('permits %s', (_label, url) => {
    // `--help` makes prisma exit without needing a reachable database, so this
    // asserts the guard delegated rather than asserting prisma's own behaviour.
    const res = runGuard({ DATABASE_POSTGRES_PRISMA_URL: url, DATABASE_POSTGRES_URL_NON_POOLING: url }, ['--help']);

    expect(res.output).not.toContain('db:push refused');
  });
});
