/**
 * Block Genomics — GET /api/v1/leaderboard
 *
 * Ranked list of verified agents by trust score.
 *
 * Query parameters:
 * - `limit`  — Number of entries (1–100, default 25)
 * - `offset` — Pagination offset (default 0)
 * - `tier`   — Filter by tier: `1`, `2`, `3`, or omit for all
 *
 * @module routes/leaderboard
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInt } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/leaderboard`
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "entries": [
 *       { "rank": 1, "id": "bg_...", "name": "...", "trustScore": 92, ... },
 *       ...
 *     ],
 *     "total": 1024,
 *     "limit": 25,
 *     "offset": 0
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`leaderboard:${ip}`, { maxRequests: 15, windowMs: 60_000 });

    // --- Parse params ---
    const url = request.nextUrl;
    const limit = validateInt(
      parseInt(url.searchParams.get("limit") ?? "25", 10),
      "limit",
      1,
      100,
    );
    const offset = validateInt(
      parseInt(url.searchParams.get("offset") ?? "0", 10),
      "offset",
      0,
      100_000,
    );
    const tierParam = url.searchParams.get("tier");
    const tier = tierParam ? parseInt(tierParam, 10) : undefined;

    // Validate tier if provided
    if (tier !== undefined && (isNaN(tier) || tier < 1 || tier > 3)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "tier must be 1, 2, or 3" } },
        { status: 400, headers: corsHeaders() },
      );
    }

    // --- Query ---
    const where = {
      verified: true,
      ...(tier !== undefined ? { tier } : {}),
    };

    const [agents, total] = await Promise.all([
      db.agent.findMany({
        where,
        select: {
          id: true,
          name: true,
          blockHeight: true,
          genome: true,
          tier: true,
          trustScore: true,
          isAI: true,
          profileColor: true,
          verifiedAt: true,
          _count: {
            select: { verifications: true },
          },
        },
        orderBy: [{ trustScore: "desc" }, { verifiedAt: "asc" }],
        take: limit,
        skip: offset,
      }),
      db.agent.count({ where }),
    ]);

    // --- Compute trust tier labels ---
    function trustTier(score: number): string {
      if (score >= 91) return "diamond";
      if (score >= 76) return "platinum";
      if (score >= 51) return "gold";
      if (score >= 26) return "silver";
      if (score > 0) return "bronze";
      return "unranked";
    }

    const entries = agents.map((a, i) => ({
      rank: offset + i + 1,
      id: a.id,
      name: a.name,
      blockHeight: a.blockHeight,
      genome: a.genome.slice(0, 16) + "…",
      tier: a.tier,
      trustScore: a.trustScore,
      trustTier: trustTier(a.trustScore),
      isAI: a.isAI,
      profileColor: a.profileColor,
      verificationCount: a._count.verifications,
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          entries,
          total,
          limit,
          offset,
        },
      },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function handleError(err: unknown): NextResponse {
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: err.message } },
      { status: 429, headers: corsHeaders() },
    );
  }
  if (err instanceof Error && err.name === "ValidationError") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: err.message } },
      { status: 400, headers: corsHeaders() },
    );
  }
  console.error("[leaderboard] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
