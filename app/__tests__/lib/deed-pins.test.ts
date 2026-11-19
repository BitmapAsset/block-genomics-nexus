/**
 * The deed pins: the 18 canonical deeds the resolver recorded through ord on
 * 2026-10-15, as code.
 *
 * Source of truth: packages/bitmap-resolver/test/vectors/heights/*.json (read
 * only here, with `fs`). The table must equal every recorded canonical id under
 * its height and pin nothing else, and it applies only under the rule id it was
 * recorded with.
 */

import fs from 'fs';
import path from 'path';
import { RULE_ID } from '@/vendor/bitmap-resolver';
import { DEED_PINS, DEED_PINS_RULE_ID, DEED_PINS_RECORDED_AT } from '@/lib/onchain/deed-pins.data';
import { pinnedDeed } from '@/lib/onchain/deed-pins';

const VECTORS = path.join(__dirname, '../../../packages/bitmap-resolver/test/vectors/heights');

interface Vector {
  height: number;
  rule: string;
  recordedAt: string;
  expected: { verdict: string; canonicalId: string | null };
}

const vectors: Vector[] = fs
  .readdirSync(VECTORS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(VECTORS, f), 'utf8')) as Vector);

it('DEED_PINS equals the canonical vectors: 18 rows, nothing else', () => {
  const recorded: Record<string, string> = {};
  for (const v of vectors) {
    if (v.expected.verdict === 'canonical' && typeof v.expected.canonicalId === 'string') {
      recorded[String(v.height)] = v.expected.canonicalId;
    }
  }
  expect(Object.keys(recorded)).toHaveLength(18);
  expect({ ...DEED_PINS }).toEqual(recorded);
  for (const v of vectors) {
    expect(v.rule).toBe(DEED_PINS_RULE_ID);
    expect(v.recordedAt).toBe(DEED_PINS_RECORDED_AT);
  }
});

it('the pins were recorded under the rule id the app runs', () => {
  expect(DEED_PINS_RULE_ID).toBe(RULE_ID);
});

it('pinnedDeed answers a pinned height and nothing for another', () => {
  expect(pinnedDeed(720143)).toEqual({ inscriptionId: '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0' });
  expect(pinnedDeed(840001)).toBeNull();
});

it('under another rule id no height is pinned', () => {
  jest.isolateModules(() => {
    jest.doMock('@/vendor/bitmap-resolver', () => ({ RULE_ID: 'other' }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require('@/lib/onchain/deed-pins') as typeof import('@/lib/onchain/deed-pins');
    expect(isolated.pinnedDeed(720143)).toBeNull();
  });
});
