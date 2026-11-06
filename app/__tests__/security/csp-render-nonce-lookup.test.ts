/**
 * The nonce Next puts on its own <script> tags is the middleware's, whatever
 * the host does with the request headers the middleware leaves out.
 *
 * Next reads the nonce while it renders from the request headers in this
 * order (next 15.5.28, dist/server/app-render/app-render.js:108,
 * parseRequestHeaders, not exported):
 *   headers['content-security-policy'] || headers['content-security-policy-report-only']
 * then getScriptNonceFromHeader on that one value. A request header the
 * middleware leaves out of `x-middleware-override-headers` is removed by
 * Next's own router, but a host that applies the override itself may keep it.
 * So the render is checked against both header maps: the original request
 * headers plus every `x-middleware-request-*` value (a header left out is
 * kept), and the override list alone (a header left out is removed).
 */

import { NextRequest } from 'next/server';
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import nextConfig from '../../next.config';
import { middleware } from '@/middleware';

const BASE = 'https://blockgenomics.io';
const PREFIX = 'x-middleware-request-';

/** The request headers the page render sees, by how the host applies the middleware's override. */
function renderHeaders(req: NextRequest, res: Response, unlisted: 'kept' | 'removed'): Record<string, string> {
  const original: Record<string, string> = {};
  req.headers.forEach((v, k) => (original[k.toLowerCase()] = v));
  const listed = (res.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean);
  if (listed.length === 0) return original;
  const out: Record<string, string> = unlisted === 'kept' ? original : {};
  res.headers.forEach((v, k) => {
    if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = v;
  });
  return out;
}

/** app-render.js:108-109 */
function renderNonce(headers: Record<string, string>): string | undefined {
  const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
  return typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
}

async function enforcedPolicy(): Promise<string> {
  const entries = await nextConfig.headers!();
  const all = entries.find((e) => e.source === '/(.*)')!;
  return all.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
}

const PAGES = ['/', '/docs', '/docs/faq', '/explore', '/protocol', '/block/612888'];

describe('the nonce Next reads while rendering a page is the middleware nonce', () => {
  let enforced: string;
  beforeAll(async () => {
    enforced = await enforcedPolicy();
    // the enforced policy has no nonce of its own, so it can never supply one
    expect(getScriptNonceFromHeader(enforced)).toBeUndefined();
  });

  const incoming: Array<[string, () => Record<string, string>]> = [
    ['no CSP request header', () => ({})],
    ['a CSP request header without a nonce', () => ({ 'content-security-policy': enforced })],
    ['a client CSP request header with its own nonce', () => ({ 'content-security-policy': "script-src 'nonce-AAAA'" })],
    [
      'client CSP and report-only request headers plus x-nonce',
      () => ({
        'content-security-policy': enforced,
        'content-security-policy-report-only': "script-src 'nonce-AAAA'",
        'x-nonce': 'AAAA',
      }),
    ],
  ];

  describe.each(['kept', 'removed'] as const)('request headers left out of the override: %s', (unlisted) => {
    it.each(PAGES.flatMap((p) => incoming.map(([label, h]) => [p, label, h] as const)))(
      '%s with %s',
      (p, _label, h) => {
        const req = new NextRequest(new URL(p, BASE), { method: 'GET', headers: { accept: 'text/html', ...h() } });
        const res = middleware(req);
        const nonce = res.headers.get(`${PREFIX}x-nonce`);
        expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        const seen = renderHeaders(req, res, unlisted);
        expect(renderNonce(seen)).toBe(nonce);
        expect(seen['x-nonce']).toBe(nonce);
      },
    );
  });
});
