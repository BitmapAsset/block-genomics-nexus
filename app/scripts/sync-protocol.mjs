// Sync the canonical Nexus Protocol spec into the app bundle.
//
// Canonical source of truth: repo-root `docs/protocol/NEXUS-PROTOCOL-v1.md`.
// The /protocol page renders a build-time MIRROR at `src/content/` because the
// canonical file lives outside the app's Vercel Root Directory and is therefore
// not guaranteed to be present in the serverless build context. This script
// keeps the mirror fresh from canonical when it IS reachable (local dev + any
// build that includes the repo root); otherwise it leaves the committed mirror
// untouched so the build never breaks. Runs automatically via the `prebuild`
// npm lifecycle hook.
//
// Do NOT hand-edit the mirror — edit the canonical file and let this sync run.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CANONICAL = resolve(here, '..', '..', 'docs', 'protocol', 'NEXUS-PROTOCOL-v1.md');
const MIRROR = resolve(here, '..', 'src', 'content', 'nexus-protocol-v1.md');

if (!existsSync(CANONICAL)) {
  if (existsSync(MIRROR)) {
    console.log(`[sync-protocol] canonical not reachable; keeping committed mirror at ${MIRROR}`);
    process.exit(0);
  }
  console.error(`[sync-protocol] FATAL: neither canonical (${CANONICAL}) nor mirror (${MIRROR}) exists`);
  process.exit(1);
}

const source = readFileSync(CANONICAL, 'utf8');
mkdirSync(dirname(MIRROR), { recursive: true });
const prev = existsSync(MIRROR) ? readFileSync(MIRROR, 'utf8') : null;
if (prev === source) {
  console.log('[sync-protocol] mirror already up to date');
} else {
  writeFileSync(MIRROR, source);
  console.log(`[sync-protocol] mirror updated from canonical (${source.length} bytes)`);
}
