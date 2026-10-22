/**
 * QA 2026-10-22 #24: the share descriptions said "~963,000 blocks" with the tip
 * past 972,000, and the landing's pre-fetch fallbacks said 880K+ / 930,000+.
 * They now state a lower bound that stays true as blocks are mined.
 */

import fs from 'fs';
import path from 'path';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');

it('og and twitter descriptions say 970K+ blocks', () => {
  // layout.tsx pulls in the wallet stack (ESM-only), so read its source.
  const layout = src('app/layout.tsx');
  const descriptions = [...layout.matchAll(/description:\s*"([^"]*)"/g)].map((m) => m[1]);
  expect(descriptions.filter((d) => d.includes('970K+ blocks'))).toHaveLength(2);
  expect(layout).not.toMatch(/963,000/);
});

it('landing fallbacks are no lower than 970K', () => {
  expect(src('components/LiveBlockCount.tsx')).toContain("'970K+'");
  expect(src('components/RotatingTagline.tsx')).toContain('"970,000+"');
});
