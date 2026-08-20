// Refuse to run `prisma db push` against anything but a local database.
//
// `db push` applies schema.prisma directly and writes no migration. Every
// model it creates is invisible to `prisma migrate deploy`, so the repo's
// migration chain silently stops describing the database. That is exactly how
// 25 models and 13 columns ended up unreachable from a fresh clone (#128): the
// hosted database had them, the chain never created them, and nobody could
// stand the project up until a corrective baseline migration was written.
//
// The CI `migrations` job now catches that drift on a pull request. It cannot
// catch the unrecoverable case -- a developer pointing `db push` at the hosted
// database, which mutates production and leaves no artifact to review.
//
// Host ALLOWLIST rather than a prod/neon denylist: a denylist has to predict
// every hostname the project will ever deploy to, and silently permits the one
// it has not heard of yet. Local development is the only case this script is
// for, and local hostnames are a closed set.

import { spawnSync } from 'node:child_process';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

// Both are read by prisma/schema.prisma; `directUrl` is the one db push uses,
// but a mismatched pair is a misconfiguration worth failing on either way.
const VARS = ['DATABASE_POSTGRES_PRISMA_URL', 'DATABASE_POSTGRES_URL_NON_POOLING'];

function refuse(message) {
  console.error(`\n✖ db:push refused — ${message}\n`);
  console.error('  `prisma db push` is for a local database only. To change the schema for');
  console.error('  everyone, write a migration instead:\n');
  console.error('      npx prisma migrate dev --name <what_changed>\n');
  process.exit(1);
}

const present = VARS.filter((v) => process.env[v]);
if (present.length === 0) {
  refuse(`no database configured (set ${VARS[0]})`);
}

for (const name of present) {
  const raw = process.env[name];
  let host;
  try {
    host = new URL(raw).hostname;
  } catch {
    refuse(`${name} is not a parseable URL`);
  }

  // A URL like `postgresql://[::1]:5432/db` parses with the brackets retained.
  const bare = host.replace(/^\[|\]$/g, '');

  if (!LOCAL_HOSTS.has(bare)) {
    // Never echo the URL itself — it carries credentials.
    refuse(`${name} points at a non-local host (${bare})`);
  }
}

if (process.env.NODE_ENV === 'production') {
  refuse('NODE_ENV=production');
}

const result = spawnSync('npx', ['prisma', 'db', 'push', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
