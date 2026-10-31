/**
 * Response headers set in next.config.ts: no `x-powered-by`, and the enforced
 * CSP value is exactly what it was, in both places it is defined
 * (next.config.ts and vercel.json). The nonce policy is sent report-only by the
 * middleware (csp-report-only.test.ts); enforcing it is its own phase. The CSP
 * is compared by digest and length so this file does not carry a second copy of
 * the policy.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import nextConfig from '../../next.config';

/** sha256 of the CSP value at 3ef46497 and 5d67dacd (313 characters). */
const CSP_DIGEST = '104b98356e58a121608cffb45cbecddcf2fbb576ca5cca7adea84e88a8222b0d';

describe('next.config.ts headers', () => {
  it('does not send x-powered-by', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('keeps the Content-Security-Policy value unchanged', async () => {
    const entries = await nextConfig.headers!();
    const all = entries.find((e) => e.source === '/(.*)')!;
    const csp = all.headers.filter((h) => h.key === 'Content-Security-Policy');
    expect(csp).toHaveLength(1);
    expect(csp[0].value).toHaveLength(313);
    expect(createHash('sha256').update(csp[0].value).digest('hex')).toBe(CSP_DIGEST);
    expect(csp[0].value).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
  });
});

describe('vercel.json headers', () => {
  it('keeps the Content-Security-Policy value unchanged and equal to next.config.ts', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const all = vercel.headers.filter((e) => e.source === '/(.*)');
    expect(all).toHaveLength(1);
    const csp = all[0].headers.filter((h) => h.key.toLowerCase() === 'content-security-policy');
    expect(csp).toHaveLength(1);
    expect(csp[0].value).toHaveLength(313);
    expect(createHash('sha256').update(csp[0].value).digest('hex')).toBe(CSP_DIGEST);

    const entries = await nextConfig.headers!();
    const fromConfig = entries.find((e) => e.source === '/(.*)')!.headers.find((h) => h.key === 'Content-Security-Policy')!;
    expect(csp[0].value).toBe(fromConfig.value);
  });

  it('neither file defines a report-only policy (the middleware is its only source)', () => {
    for (const f of ['vercel.json', 'next.config.ts']) {
      expect([f, /report-only/i.test(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'))]).toEqual([f, false]);
    }
  });
});
