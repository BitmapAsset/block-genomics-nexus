/**
 * The two header sources (vercel.json and next.config.ts) send the same headers with the same values on every page,
 * and the page policy frames only the three stream players.
 */

import fs from 'fs';
import path from 'path';
import nextConfig from '../../next.config';
import { PLAYER_ORIGINS } from '@/lib/stream-embed';

type Header = { key: string; value: string };

function vercelHeaders(): Record<string, string> {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8')) as {
    headers: { source: string; headers: Header[] }[];
  };
  const all = json.headers.find((e) => e.source === '/(.*)')!;
  return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
}

async function nextHeaders(): Promise<Record<string, string>> {
  const entries = await nextConfig.headers!();
  const all = entries.find((e) => e.source === '/(.*)')!;
  return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
}

function directives(policy: string): string[] {
  return policy.split(';').map((d) => d.trim()).filter((d) => d !== '');
}

describe('header sources agree', () => {
  it('H1 the two header sources send the same headers with the same values on every page', async () => {
    expect(await nextHeaders()).toEqual(vercelHeaders());
  });

  it('H2 the page policy frames only the three stream players and is framed by nobody', async () => {
    const policies = [vercelHeaders()['Content-Security-Policy'], (await nextHeaders())['Content-Security-Policy']];
    for (const policy of policies) {
      expect(typeof policy).toBe('string');
      const parts = directives(policy);
      const frame = parts.filter((d) => d.startsWith('frame-src'));
      expect(frame).toHaveLength(1);
      expect(frame[0]).toBe('frame-src ' + PLAYER_ORIGINS.join(' '));
      expect(parts.filter((d) => d.startsWith('child-src'))).toEqual([]);
      expect(parts).toContain("frame-ancestors 'none'");
    }
  });
});
