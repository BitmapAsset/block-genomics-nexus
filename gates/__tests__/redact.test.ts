import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redact } from '../lib/redact.ts';
import type { Check } from '../lib/types.ts';
import { runGates } from '../run.ts';
import { fakeFetch } from './helpers.ts';

// Made-up strings in the shape of a Bitcoin address; neither is a real one.
const SEGWIT = 'bc1p' + 'q'.repeat(40) + 'x2';
const LEGACY = '1' + 'A'.repeat(30) + 'zz';

describe('address redaction', () => {
  it('replaces both address shapes in a line', () => {
    expect(redact(`owner ${SEGWIT} and ${LEGACY}.`)).toBe('owner <address> and <address>.');
  });

  it('leaves other text alone', () => {
    expect(redact('block 840000 answered 503')).toBe('block 840000 answered 503');
  });

  it('redacts the printed lines and the JSON the runner writes', async () => {
    const check: Check = {
      id: 'G-MADE-UP',
      promise: 'A made-up promise.',
      group: 'promise',
      needs: [],
      probe: async () => ({ status: 'fail', reason: `owned by ${SEGWIT}`, values: { owner: LEGACY } }),
    };
    const out = mkdtempSync(join(tmpdir(), 'gates-redact-'));
    const printed: string[] = [];
    const res = await runGates({
      argv: ['--out', out],
      env: {},
      fetchImpl: fakeFetch({}),
      checks: [check],
      print: (l) => printed.push(l),
    });
    expect(res.code).toBe(0);
    const json = readFileSync(join(out, 'latest.json'), 'utf8');
    expect(json).toContain('<address>');
    expect(json).not.toContain(SEGWIT);
    expect(json).not.toContain(LEGACY);
    expect(printed.join('\n')).toContain('owned by <address>');
    expect(printed.join('\n')).not.toContain(SEGWIT);
  });
});
