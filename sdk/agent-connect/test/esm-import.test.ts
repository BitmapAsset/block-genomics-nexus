import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// vitest resolves extensionless relative imports, so it cannot catch a dist
// that plain Node ESM refuses to load. 0.4.0 shipped exactly that
// (`./action-message` without `.js`). Import the built package with Node itself.
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

describe('published ESM entry', () => {
  (existsSync(dist) ? it : it.skip)('loads under plain Node ESM', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(dist)});` +
          `console.log(typeof m.BlockGenomicsClient, typeof m.makeSigner);`,
      ],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('function function');
  });
});
