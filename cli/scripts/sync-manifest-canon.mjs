// Mirror the manifest-signing core from the SDK into the CLI.
//
// WHY THIS EXISTS
// The CLI has to sign experience manifests, and signing means hashing the exact
// canonical bytes the server will re-derive. Getting those bytes from a third
// hand-maintained copy of the canonicalizer would mean three files that must
// agree forever, with the loosest one silently deciding what a signature
// commits to.
//
// The CLI cannot simply `require` the SDK either: this tree has no npm
// workspaces (each package installs from its own lockfile in CI), and the
// canonicalizer is not in any published `block-genomics-connect` release, so a
// version range would not resolve.
//
// So the SDK source is the single editable copy and these mirrors are
// GENERATED. Drift is not merely discouraged, it is un-mergeable: the CLI test
// suite runs this script in --check mode.
//
//   npm run sync:canon          regenerate the mirrors
//   npm run sync:canon -- --check   fail if they are stale (what CI runs)
//
// This is the same generate-a-mirror pattern app/scripts/sync-protocol.mjs uses
// for the protocol spec, for the same reason: the canonical file lives outside
// this package's publish root.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, '..');
const repoRoot = resolve(cliRoot, '..');
const sdkSrc = resolve(repoRoot, 'sdk', 'agent-connect', 'src');
const cliLib = resolve(cliRoot, 'src', 'lib');

/** Files mirrored verbatim. Both are pure (no node built-ins, Web Crypto only). */
const MIRRORS = [
  { from: resolve(sdkSrc, 'action-message.ts'), to: resolve(cliLib, 'action-message.ts') },
  { from: resolve(sdkSrc, 'experience-manifest.ts'), to: resolve(cliLib, 'experience-manifest.ts') },
];

function header(sourceRelPath) {
  return [
    '// ⚠️  GENERATED FILE — DO NOT EDIT.',
    '//',
    `// Mirrored verbatim from ${sourceRelPath} by`,
    '// cli/scripts/sync-manifest-canon.mjs. Edit the SDK source and re-run',
    '// `npm run sync:canon`; editing this copy will fail the CLI test suite.',
    '//',
    '// These bytes decide what a BIP-322 signature commits to, so a divergence',
    '// between this copy and the SDK/server would not fail loudly — it would',
    '// produce signatures the server quietly rejects, or worse, accepts over a',
    '// manifest the signer never saw.',
    '',
  ].join('\n');
}

function expected(mirror) {
  const sourceRelPath = relative(repoRoot, mirror.from).split('\\').join('/');
  return header(sourceRelPath) + readFileSync(mirror.from, 'utf8');
}

const check = process.argv.includes('--check');
const stale = [];

for (const mirror of MIRRORS) {
  if (!existsSync(mirror.from)) {
    // The SDK source lives outside this package's publish root, so it is absent
    // when building from a published tarball. A committed mirror is then the
    // best available truth — don't break a build that has nothing to compare to.
    if (existsSync(mirror.to)) {
      console.log(`[sync-canon] SDK source not reachable; keeping committed mirror: ${mirror.to}`);
      continue;
    }
    console.error(`[sync-canon] FATAL: neither SDK source (${mirror.from}) nor mirror (${mirror.to}) exists`);
    process.exit(1);
  }
  const want = expected(mirror);
  const have = existsSync(mirror.to) ? readFileSync(mirror.to, 'utf8') : null;
  const rel = relative(cliRoot, mirror.to).split('\\').join('/');

  if (have === want) {
    if (!check) console.log(`[sync-canon] up to date: ${rel}`);
    continue;
  }
  if (check) {
    stale.push(rel);
    continue;
  }
  mkdirSync(dirname(mirror.to), { recursive: true });
  writeFileSync(mirror.to, want);
  console.log(`[sync-canon] ${have === null ? 'created' : 'updated'}: ${rel}`);
}

if (stale.length) {
  console.error(
    `[sync-canon] STALE MIRROR(S): ${stale.join(', ')}\n` +
      '  The CLI copy no longer matches the SDK source. If you edited the CLI\n' +
      '  copy, move the change into sdk/agent-connect/src/ instead.\n' +
      '  Then run: npm run sync:canon',
  );
  process.exit(1);
}

if (check) console.log('[sync-canon] mirrors match the SDK source');
