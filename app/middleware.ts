import { NextRequest, NextResponse } from 'next/server';

/**
 * RuneBolt Static File Middleware
 * 
 * Handles serving RuneBolt static files with:
 * - Case-insensitive routing
 * - Trailing slash normalization
 * - Static asset serving from /public/runebolt/
 */

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Normalize path: lowercase, remove trailing slash except root
  let normalizedPath = pathname.toLowerCase();
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  
  // Check if this is a RuneBolt request
  if (normalizedPath === '/runebolt' || normalizedPath.startsWith('/runebolt/')) {
    // Serve static files from /public/runebolt/
    const filePath = normalizedPath === '/runebolt' 
      ? '/runebolt/index.html'
      : normalizedPath;
    
    // Rewrite to the static file
    const url = request.nextUrl.clone();
    url.pathname = filePath;
    return NextResponse.rewrite(url);
  }
  
  // Allow other requests to continue
  return NextResponse.next();
}

// Match all paths except API routes and static assets
export const config = {
  matcher: [
    '/runebolt',
    '/runebolt/:path*',
    '/Runebolt',
    '/Runebolt/:path*',
    '/RUNEBOLT',
    '/RUNEBOLT/:path*',
  ],
};
