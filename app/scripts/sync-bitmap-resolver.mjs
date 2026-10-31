// Mirror packages/bitmap-resolver/src into the app bundle.
//
// Canonical source: repo-root `packages/bitmap-resolver/src`. The app's Vercel
// Root Directory is `app/`, so (as with sync-protocol.mjs) files outside it are
// not guaranteed to be present in the build context. The ownership gate cannot
// depend on that, so the resolver source is committed under
// `src/vendor/bitmap-resolver/` and this script keeps the copy identical.
//
// The only transform is dropping the `.js` suffix from relative import
// specifiers (the package is NodeNext ESM; the app resolves like a bundler).
//
//   node scripts/sync-bitmap-resolver.mjs          rewrite the mirror
//   node scripts/sync-bitmap-resolver.mjs --check  exit 1 if the mirror drifted
//
// `__tests__/lib/bitmap-resolver-mirror.test.ts` runs --check, so a change to
// the package that is not synced here fails the app suite.
//
// Do NOT hand-edit the mirror: edit the package, then run this script.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CANONICAL = resolve(here, '..', '..', 'packages', 'bitmap-resolver', 'src');
const MIRROR = resolve(here, '..', 'src', 'vendor', 'bitmap-resolver');
const check = process.argv.includes('--check');

/** Relative `.ts` files under `dir`, sorted. */
function listTs(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full, base));
    else if (entry.name.endsWith('.ts')) out.push(relative(base, full));
  }
  return out.sort();
}

export function transform(source) {
  return source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2$3');
}

if (!existsSync(CANONICAL)) {
  if (check) {
    console.log(`[sync-bitmap-resolver] canonical not reachable at ${CANONICAL}; nothing to compare`);
    process.exit(0);
  }
  console.error(`[sync-bitmap-resolver] FATAL: canonical source not found at ${CANONICAL}`);
  process.exit(1);
}

const want = new Map(listTs(CANONICAL).map((f) => [f, transform(readFileSync(join(CANONICAL, f), 'utf8'))]));
const have = listTs(MIRROR);

if (check) {
  const drift = [];
  for (const [f, body] of want) {
    const p = join(MIRROR, f);
    if (!existsSync(p)) drift.push(`missing ${f}`);
    else if (readFileSync(p, 'utf8') !== body) drift.push(`differs ${f}`);
  }
  for (const f of have) if (!want.has(f)) drift.push(`extra ${f}`);
  if (drift.length > 0) {
    console.error(`[sync-bitmap-resolver] mirror drifted from packages/bitmap-resolver/src:\n  ${drift.join('\n  ')}\nRun: node scripts/sync-bitmap-resolver.mjs`);
    process.exit(1);
  }
  console.log(`[sync-bitmap-resolver] mirror matches (${want.size} files)`);
  process.exit(0);
}

for (const f of have) if (!want.has(f)) rmSync(join(MIRROR, f));
for (const [f, body] of want) {
  const p = join(MIRROR, f);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
console.log(`[sync-bitmap-resolver] wrote ${want.size} files to ${relative(process.cwd(), MIRROR)}`);
