/**
 * Response headers set in next.config.ts: no `x-powered-by`, and the CSP value
 * is exactly what it was (the nonce CSP is its own wave, with a report-only
 * phase first). The CSP is compared by digest and length so this file does not
 * carry a second copy of the policy.
 */

import { createHash } from 'crypto';
import nextConfig from '../../next.config';

/** sha256 of the CSP value at 3ef46497 (313 characters). */
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
