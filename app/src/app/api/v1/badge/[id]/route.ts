import { NextRequest, NextResponse } from "next/server";
import { crownShieldSVGString } from "@/components/CrownShield";
import prisma from "@/lib/prisma";

/**
 * GET /api/v1/badge/[id].svg
 *
 * Returns the Crown Shield SVG badge for the given agent/badge ID.
 * Tiers: 0 (Grey/Unverified), 1 (Gold/Bitmap owner), 2 (Cyan/Tx verified), 3 (Purple/Delegated)
 * SSOT is User.resolvedTier. Unknown ids and unresolved users render the T0 unverified badge.
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

  // Look up live tier from the SSOT (User.resolvedTier) by handle or wallet address.
  // Default to Tier 0 / unverified: an unknown id (non-existent user) or a user whose
  // tier hasn't resolved on-chain MUST NOT render a gold "verified T1" shield.
  let tier: 0 | 1 | 2 | 3 = 0;
  let verified = false;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { handle: cleanId },
        { walletAddress: cleanId },
      ],
    },
    select: { resolvedTier: true },
  });

  if (user) {
    const resolvedTier = user.resolvedTier ?? 0;
    if (resolvedTier === 1 || resolvedTier === 2 || resolvedTier === 3) {
      tier = resolvedTier;
      verified = true;
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
