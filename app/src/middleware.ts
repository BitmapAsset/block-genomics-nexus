/**
 * Next.js Middleware
 *
 * 1. Sandbox read-only enforcement for /api/* — one choke point, so every current
 *    and future route inherits it without per-route wiring.
 * 2. CORS for /api/*, per path and method (lib/cors.ts). This is the only
 *    place that sets it; next.config.ts and vercel.json no longer do.
 * 3. Case-insensitive URL routing for pages: redirects any uppercase path to its
 *    lowercase equivalent (/NEXUS → /nexus, /Verify → /verify).
 * 4. Pages: a report-only content security policy with a fresh nonce per
 *    request (lib/csp.ts). The enforced Content-Security-Policy is not set
 *    here; next.config.ts and vercel.json stay its only source. A nonce is
 *    only ever the middleware's: client-sent nonce headers are dropped on
 *    every non-/api path the middleware runs for.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isReadMethod, sandboxKeyFromHeaders, sandboxWriteBlockedBody } from '@/lib/sandbox-tier';
import { corsHeadersFor } from '@/lib/cors';
import { buildReportOnlyPolicy, createNonce } from '@/lib/csp';

/** Request headers a nonce is read from while rendering; only the middleware sets them. */
const CLIENT_NONCE_HEADERS = ['x-nonce', 'content-security-policy', 'content-security-policy-report-only'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Sandbox tier: block writes before they reach any handler ──
  // Shape-only check — this runs on the Edge runtime, which cannot reach Postgres,
  // so the key is not validated here. That is sound: presenting a sandbox-shaped
  // credential is an explicit claim to the sandbox tier, and a caller who omits it
  // just falls through to the route's own ownership gate. Rejecting a forged
  // `bg_sbx_` string on a write denies the caller nothing they were entitled to.
  // Real validation and quota metering happen in-route (lib/sandbox-keys.ts).
  if (pathname.startsWith('/api/')) {
    const cors = corsHeadersFor(pathname, req.method, req.headers.get('access-control-request-method'));
    if (!isReadMethod(req.method) && sandboxKeyFromHeaders(req.headers)) {
      return NextResponse.json(sandboxWriteBlockedBody(req.method, pathname), {
        status: 403,
        headers: { 'X-BG-Tier': 'sandbox', 'Cache-Control': 'no-store', ...cors },
      });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  // Skip static files, Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.includes('.')
  ) {
    // No nonce is made here, and a client-sent one is dropped, so nothing
    // behind this branch reads `x-nonce` (app code) or a CSP request header
    // (Next's own <script> tags) from the client.
    if (CLIENT_NONCE_HEADERS.some((h) => req.headers.has(h))) {
      const requestHeaders = new Headers(req.headers);
      for (const h of CLIENT_NONCE_HEADERS) requestHeaders.delete(h);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  const lowered = pathname.toLowerCase();

  if (pathname !== lowered) {
    const url = req.nextUrl.clone();
    url.pathname = lowered;
    return NextResponse.redirect(url, 308); // 308 = permanent redirect, preserves method
  }

  // ── Pages: report-only policy with a per-request nonce ──
  // Next puts the nonce it finds in the request's CSP header on its own
  // <script> tags while it renders (app-render reads `content-security-policy`,
  // then `content-security-policy-report-only`); `x-nonce` is for app code.
  // Request headers never reach the browser. A `content-security-policy`
  // request header from the client is dropped so it cannot win that lookup.
  const nonce = createNonce();
  const policy = buildReportOnlyPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('content-security-policy');
  requestHeaders.set('content-security-policy-report-only', policy);
  requestHeaders.set('x-nonce', nonce);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy-Report-Only', policy);
  return res;
}

export const config = {
  // `/api/:path*` is matched so the sandbox write-block and CORS above can run;
  // every API request that is not a sandbox write continues with
  // NextResponse.next() plus its CORS headers, leaving routing untouched.
  matcher: ['/api/:path*', '/((?!api|_next/static|_next/image|favicon.ico|assets).*)'],
};
