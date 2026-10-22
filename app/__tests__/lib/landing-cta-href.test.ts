/**
 * QA 2026-10-22 #28: the landing's main CTA "Verify a Block" linked /verify,
 * which is a 301 to /my-bitmaps (one extra round trip on the first tap). The
 * link target is now the destination itself; nothing visual changed.
 */

import fs from 'fs';
import path from 'path';

const appDir = path.join(__dirname, '..', '..', 'src', 'app');

function landingPage(): string {
  // The landing lives at the app root or in a route group such as (landing).
  for (const d of ['', ...fs.readdirSync(appDir).filter((e) => /^\(.+\)$/.test(e))]) {
    const f = path.join(appDir, d, 'page.tsx');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  }
  throw new Error('landing page not found');
}

it('points "Verify a Block" straight at /my-bitmaps', () => {
  const src = landingPage();
  const cta = /<Link\s+href="([^"]+)"[^>]*>\s*Verify a Block/.exec(src);
  expect(cta?.[1]).toBe('/my-bitmaps');
});
