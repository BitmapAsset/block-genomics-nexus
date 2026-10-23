/**
 * QA 2026-10-22 #22: /favicon.ico answered 404 with the 44 KB HTML page.
 * Browsers, WeChat and some crawlers ask for it no matter what <link> says.
 */

import fs from 'fs';
import path from 'path';

it('ships a real ICO at /favicon.ico', () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'favicon.ico'));
  // ICONDIR: reserved 0, type 1 (icon), at least one image
  expect(buf.readUInt16LE(0)).toBe(0);
  expect(buf.readUInt16LE(2)).toBe(1);
  expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
  expect(buf.length).toBeLessThan(20_000);
});
