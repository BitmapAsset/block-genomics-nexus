/**
 * The Brain reads its soul from ord's /content on the configured ordinals host
 * and nowhere else. The ord.io fallback answered 404 for /content/<id>
 * (checked 2026-10-18), so it only ever added a 10 s wait before the
 * hardcoded fallback.
 */

import { fetchSoulFromInscription } from '@/lib/brain/inscription';
import { DEFAULT_BRAIN_CONFIG } from '@/lib/brain/types';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

it('asks only the configured ordinals host, then falls back to the protocol soul', async () => {
  const seen: string[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response('down', { status: 503 });
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  const out = await fetchSoulFromInscription(DEFAULT_BRAIN_CONFIG);

  expect(out.source).toBe('fallback');
  expect(seen).toHaveLength(1);
  expect(new URL(seen[0]).origin).toBe(new URL(DEFAULT_BRAIN_CONFIG.ordinalsApiUrl).origin);
  expect(seen.join(' ')).not.toMatch(/ord\.io/);
});
