import { NextRequest, NextResponse } from "next/server";
import { crownShieldSVGString } from "@/components/CrownShield";
import prisma from "@/lib/prisma";

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

  // Look up actual tier from DB (by handle or wallet address)
  let tier: 1 | 2 | 3 = 1;
  const verified = true;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { handle: cleanId },
        { walletAddress: cleanId },
      ],
    },
    select: { resolvedTier: true, tier: true },
  });

  if (user) {
    const resolvedTier = user.resolvedTier ?? user.tier ?? 1;
    if (resolvedTier === 1 || resolvedTier === 2 || resolvedTier === 3) {
      tier = resolvedTier;
    }
  }

  const svg = crownShieldSVGString(tier, verified, 200);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
