import { NextRequest, NextResponse } from "next/server";
import { crownShieldSVGString } from "@/components/CrownShield";

/**
 * GET /api/v1/badge/[id].svg
 *
 * Returns the Crown Shield SVG badge for the given agent/badge ID.
 * Tiers: 1 (Gold/Bitmap owner), 2 (Cyan/Tx verified), 3 (Purple/Delegated)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
    return NextResponse.json(
      { error: "Invalid badge ID" },
      { status: 400 }
    );
  }

  // Strip .svg extension if present
  const cleanId = id.replace(/\.svg$/, "");

  // TODO: Look up actual tier from DB. Default to Tier 1 (Gold) for now.
  const tier = 1 as 1 | 2 | 3;
  const verified = true;

  const svg = crownShieldSVGString(tier, verified, 200);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
