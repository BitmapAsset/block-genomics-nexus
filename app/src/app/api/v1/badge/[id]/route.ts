import { NextRequest, NextResponse } from "next/server";
import { crownShieldSVGString } from "@/lib/crown-shield-svg";
import prisma from "@/lib/prisma";

/**
 * GET /api/v1/badge/[id].svg
 *
 * Returns the Crown Shield SVG badge for the given agent/badge ID.
 * Tiers: 0 (Grey/Unverified), 1 (Gold/Bitmap owner), 2 (Cyan/Tx verified), 3 (Purple/Delegated)
 * SSOT is User.resolvedTier. Unknown ids and unresolved users render the T0 unverified badge.
 *
 * Accepted [id] forms:
 *   - User handle (e.g. "nexus_brain")
 *   - Bitcoin wallet address
 *   - Block height (all-digits; resolves to that block's owner tier)
 *   - Any of the above with optional trailing ".svg"
 *
 * The route MUST fail gracefully. Unknown ids, malformed ids, and transient
 * DB errors all render the T0 unverified SVG at 200 (so <img> embeds never
 * break); the only 4xx is for truly malformed input.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    ({ id } = await params);
  } catch {
    return NextResponse.json({ error: "Invalid badge ID" }, { status: 400 });
  }

  if (!id || typeof id !== "string" || id.length > 128 || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid badge ID" }, { status: 400 });
  }

  // Strip .svg extension if present
  const cleanId = id.replace(/\.svg$/, "");
  if (!cleanId) {
    return NextResponse.json({ error: "Invalid badge ID" }, { status: 400 });
  }

  // Look up live tier from the SSOT (User.resolvedTier) by handle, wallet address,
  // or (if the id is a pure integer) by block height → block.owner.resolvedTier.
  // Default to Tier 0 / unverified: an unknown id (non-existent user) or a user whose
  // tier hasn't resolved on-chain MUST NOT render a gold "verified T1" shield.
  let tier: 0 | 1 | 2 | 3 = 0;
  let verified = false;

  try {
    // Handle / wallet lookup
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { handle: cleanId },
          { walletAddress: cleanId },
        ],
      },
      select: { resolvedTier: true },
    });

    let resolvedTier: number | null = user?.resolvedTier ?? null;

    // Block-height lookup (e.g. GET /api/v1/badge/1 → block 1's owner)
    if (resolvedTier === null && /^\d+$/.test(cleanId)) {
      const height = Number(cleanId);
      if (Number.isSafeInteger(height) && height >= 0 && height <= 10_000_000) {
        const block = await prisma.block.findUnique({
          where: { height },
          select: { owner: { select: { resolvedTier: true } } },
        });
        if (block?.owner) {
          resolvedTier = block.owner.resolvedTier ?? null;
        }
      }
    }

    if (resolvedTier === 1 || resolvedTier === 2 || resolvedTier === 3) {
      tier = resolvedTier;
      verified = true;
    }
  } catch (err) {
    // DB unavailable or query failure: log and fall through to T0 unverified
    // instead of surfacing a 500 to the caller. Badge embeds must never break.
    console.error("[badge] tier lookup failed:", err);
  }

  let svg: string;
  try {
    svg = crownShieldSVGString(tier, verified, 200);
  } catch (err) {
    console.error("[badge] SVG render failed:", err);
    return NextResponse.json({ error: "Failed to render badge" }, { status: 500 });
  }

  // Unverified fallbacks get a much shorter cache so tier resolution
  // propagates quickly once the user is actually verified.
  const cacheControl = verified
    ? "public, max-age=86400, s-maxage=86400"
    : "public, max-age=60, s-maxage=60";

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": cacheControl,
    },
  });
}
