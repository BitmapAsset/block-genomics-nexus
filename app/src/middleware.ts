/**
 * Next.js Middleware
 *
 * 1. Sandbox read-only enforcement for /api/* — one choke point, so every current
 *    and future route inherits it without per-route wiring.
 * 2. CORS for /api/*, per path and method (lib/cors.ts). This is the only
 *    place that sets it; next.config.ts and vercel.json no longer do.
 * 3. Case-insensitive URL routing for pages: redirects any uppercase path to its
 *    lowercase equivalent (/NEXUS → /nexus, /Verify → /verify).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isReadMethod, sandboxKeyFromHeaders, sandboxWriteBlockedBody } from '@/lib/sandbox-tier';
import { corsHeadersFor } from '@/lib/cors';

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
    return NextResponse.next();
  }

  const lowered = pathname.toLowerCase();

  if (pathname !== lowered) {
    const url = req.nextUrl.clone();
    url.pathname = lowered;
    return NextResponse.redirect(url, 308); // 308 = permanent redirect, preserves method
  }

  return NextResponse.next();
}

export const config = {
  // `/api/:path*` is matched so the sandbox write-block and CORS above can run;
  // every API request that is not a sandbox write continues with
  // NextResponse.next() plus its CORS headers, leaving routing untouched.
  matcher: ['/api/:path*', '/((?!api|_next/static|_next/image|favicon.ico|assets).*)'],
};
