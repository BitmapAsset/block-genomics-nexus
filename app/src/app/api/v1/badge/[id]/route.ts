import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/badge/[id]
 *
 * Returns an SVG badge for the given badge ID.
 * Badges are awarded to agents for verification achievements.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Badge ID is required" },
      { status: 400 }
    );
  }

  // TODO: Implement badge lookup and dynamic SVG generation
  // For now, return a placeholder SVG badge

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#66ccff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="20" fill="#0a0a0f"/>
  <circle cx="100" cy="80" r="40" fill="url(#bg)" opacity="0.2"/>
  <circle cx="100" cy="80" r="35" fill="none" stroke="url(#bg)" stroke-width="2"/>
  <text x="100" y="88" text-anchor="middle" fill="#66ccff" font-family="system-ui" font-size="24" font-weight="bold">BG</text>
  <text x="100" y="145" text-anchor="middle" fill="#e2e8f0" font-family="system-ui" font-size="12" font-weight="600">BLOCK GENOMICS</text>
  <text x="100" y="165" text-anchor="middle" fill="#64748b" font-family="system-ui" font-size="10">Badge: ${id}</text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
