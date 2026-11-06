/**
 * A nonce is chosen by the middleware, never by the client. Paths the
 * middleware passes through before the nonce step (anything with a `.`, Next
 * internals, /assets) hand the next handler a request without a client-sent
 * `x-nonce` (read by JsonLd) and without a client-sent
 * `content-security-policy` or `content-security-policy-report-only` (read by
 * Next for its own <script> tags). A request with none of them passes through
 * untouched, as pinned in middleware-unchanged.test.ts.
 *
 * Page paths keep their behaviour: the middleware's own nonce replaces the
 * client's.
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const BASE = 'https://blockgenomics.io';
const request = (p: string, headers: Record<string, string>) =>
  new NextRequest(new URL(p, BASE), { method: 'GET', headers });

const CLIENT = {
  'x-nonce': 'test-value',
  'content-security-policy': "script-src 'nonce-test-value'",
  'content-security-policy-report-only': "script-src 'nonce-test-value'",
  accept: 'text/html',
};

const overridden = (res: Response) => (res.headers.get('x-middleware-override-headers') ?? '').split(',');

describe('client-sent nonce headers never reach a handler', () => {
  it.each([
    '/sitemap.xml',
    '/robots.txt',
    '/manifest.json',
    '/block/612888.json',
    '/.well-known/mcp/server-card.json',
    '/_next/webpack-hmr',
    '/assets/logo.png',
  ])('%s: the next handler gets the request without them', (p) => {
    const res = middleware(request(p, CLIENT));
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('x-middleware-override-headers')).not.toBeNull();
    for (const h of ['x-nonce', 'content-security-policy', 'content-security-policy-report-only']) {
      expect([h, overridden(res).includes(h)]).toEqual([h, false]);
      expect([h, res.headers.get(`x-middleware-request-${h}`)]).toEqual([h, null]);
    }
    // every other request header goes through as sent
    expect(overridden(res)).toContain('accept');
    expect(res.headers.get('x-middleware-request-accept')).toBe('text/html');
    // and nothing is added to the response
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('content-security-policy-report-only')).toBeNull();
  });

  it.each([
    ['x-nonce', 'test-value'],
    ['content-security-policy', "script-src 'nonce-test-value'"],
    ['content-security-policy-report-only', "script-src 'nonce-test-value'"],
  ])('a dotted path drops %s when it is the only one sent', (h, v) => {
    const res = middleware(request('/sitemap.xml', { [h]: v }));
    expect(res.headers.get('x-middleware-override-headers')).not.toBeNull();
    expect(overridden(res)).not.toContain(h);
    expect(res.headers.get(`x-middleware-request-${h}`)).toBeNull();
  });

  // A page data request is read as its page (/_next/data/<build>/index.json is /), so it takes the page branch.
  const PAGES = ['/', '/docs/faq', '/block/612888', '/_next/data/build-id/index.json'];
  it.each(PAGES)('%s: the middleware nonce replaces the client one', (p) => {
    const res = middleware(request(p, CLIENT));
    const nonce = res.headers.get('x-middleware-request-x-nonce');
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonce).not.toBe('test-value');
    const policy = res.headers.get('x-middleware-request-content-security-policy-report-only');
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(policy).not.toContain('test-value');
    expect(res.headers.get('content-security-policy-report-only')).toBe(policy);
    expect(overridden(res)).not.toContain('content-security-policy');
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBeNull();
  });
});
