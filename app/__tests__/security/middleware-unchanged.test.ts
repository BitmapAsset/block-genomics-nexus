/**
 * What the middleware must keep answering exactly as before the report-only
 * policy: CORS on /api, the sandbox write refusal, the lowercase 308 redirect,
 * static files passed through untouched. None of them gets a report-only
 * header or a request header for rendering, and the middleware never writes
 * the enforced Content-Security-Policy on any response (next.config.ts and
 * vercel.json stay its only source).
 *
 * Runs the real `middleware` with real `NextRequest` objects from next/server.
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { corsHeadersFor } from '@/lib/cors';
import { sandboxWriteBlockedBody } from '@/lib/sandbox-tier';

const BASE = 'https://blockgenomics.io';
const request = (method: string, p: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(p, BASE), { method, headers });

const lower = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const headerObject = (h: Headers) => Object.fromEntries([...h.entries()]);

describe('middleware: answers that do not move', () => {
  it.each([
    ['GET', '/api/v1/stats', { origin: 'https://example.com' }],
    ['GET', '/api/v1/blocks/718840', {}],
    ['OPTIONS', '/api/v1/stats', { 'access-control-request-method': 'GET' }],
    ['POST', '/api/v1/auth/verify', { origin: 'https://example.com' }],
  ] as const)('%s %s: CORS headers only, nothing handed to rendering', (method, p, h) => {
    const res = middleware(request(method, p, { ...h }));
    const expected = lower(corsHeadersFor(p, method, (h as Record<string, string>)['access-control-request-method'] ?? null));
    const { 'x-middleware-next': next, ...rest } = headerObject(res.headers);
    expect(next).toBe('1');
    expect(rest).toEqual(expected);
    expect(res.headers.get('content-security-policy-report-only')).toBeNull();
    expect(res.headers.get('x-middleware-override-headers')).toBeNull();
  });

  it('refuses a sandbox write with the same 403 body and headers', async () => {
    const res = middleware(request('POST', '/api/v1/world', { authorization: 'Bearer bg_sbx_fixture' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(sandboxWriteBlockedBody('POST', '/api/v1/world'));
    expect(headerObject(res.headers)).toEqual({
      'content-type': 'application/json',
      'x-bg-tier': 'sandbox',
      'cache-control': 'no-store',
      ...lower(corsHeadersFor('/api/v1/world', 'POST', null)),
    });
  });

  it.each([
    ['/NEXUS', '/nexus'],
    ['/Verify', '/verify'],
    ['/Block/720143', '/block/720143'],
  ])('redirects %s to %s with 308 and nothing else', (from, to) => {
    const res = middleware(request('GET', from));
    expect(res.status).toBe(308);
    expect(headerObject(res.headers)).toEqual({ location: `${BASE}${to}` });
  });

  it.each(['/_next/static/chunks/main.js', '/sitemap.xml', '/robots.txt', '/manifest.json', '/icons/icon-192x192.png'])(
    'passes %s through untouched',
    (p) => {
      const res = middleware(request('GET', p));
      expect(headerObject(res.headers)).toEqual({ 'x-middleware-next': '1' });
    },
  );

  it.each([
    ['GET', '/'],
    ['GET', '/docs'],
    ['GET', '/block/720143'],
    ['GET', '/api/v1/stats'],
    ['POST', '/api/v1/world'],
    ['GET', '/NEXUS'],
  ])('%s %s: the middleware never sets the enforced Content-Security-Policy', (method, p) => {
    const res = middleware(request(method, p, method === 'POST' ? { authorization: 'Bearer bg_sbx_fixture' } : {}));
    expect(res.headers.get('content-security-policy')).toBeNull();
    // pages hand rendering the report-only policy on that request header, never the enforced one
    expect([null, res.headers.get('content-security-policy-report-only')]).toContain(
      res.headers.get('x-middleware-request-content-security-policy'),
    );
  });
});
