/**
 * Next.js Middleware — Case-Insensitive URL Routing
 * 
 * Redirects any uppercase path to its lowercase equivalent.
 * e.g., /NEXUS → /nexus, /Verify → /verify, /WhitePaper → /whitepaper
 * 
 * API routes and static assets are excluded (they handle their own casing).
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes, static files, Next.js internals
  if (
    pathname.startsWith('/api/') ||
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|assets).*)'],
};
