/**
 * Block Genomics — GET /api/v1/search
 *
 * Full-text search across agents, blocks, and genomes.
 *
 * Query parameters:
 * - `q`     — Search query (required, 1–200 chars)
 * - `type`  — Filter: `"agents"`, `"blocks"`, `"all"` (default)
 * - `limit` — Results per category (1–50, default 10)
 * - `offset`— Pagination offset (default 0)
 *
 * @module routes/search
 */

import { NextRequest, NextResponse } from "next/server";
import { validateString, validateInt } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/search?q=...`
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "query": "500000",
 *     "agents": [ ... ],
 *     "blocks": [ ... ],
 *     "totalAgents": 3,
 *     "totalBlocks": 1
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`search:${ip}`, { maxRequests: 20, windowMs: 60_000 });

    // --- Parse query params ---
    const url = request.nextUrl;
    const q = validateString(url.searchParams.get("q") ?? "", "q", 1, 200);
    const type = (url.searchParams.get("type") ?? "all") as "agents" | "blocks" | "all";
    const limit = validateInt(
      parseInt(url.searchParams.get("limit") ?? "10", 10),
      "limit",
      1,
      50,
    );
    const offset = validateInt(
      parseInt(url.searchParams.get("offset") ?? "0", 10),
      "offset",
      0,
      10_000,
    );

    // Sanitize: strip anything that isn't alphanumeric, spaces, underscores, hyphens, dots
    const sanitized = q.replace(/[^a-zA-Z0-9\s_\-\.]/g, "").trim();
    if (!sanitized) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_QUERY", message: "Search query is empty after sanitization" } },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Check if query is numeric (could be a block height)
    const isNumeric = /^\d+$/.test(sanitized);

    const result: {
      query: string;
      agents: unknown[];
      blocks: unknown[];
      totalAgents: number;
      totalBlocks: number;
    } = {
      query: sanitized,
      agents: [],
      blocks: [],
      totalAgents: 0,
      totalBlocks: 0,
    };

    // --- Search agents ---
    if (type === "agents" || type === "all") {
      const agentWhere = {
        OR: [
          { name: { contains: sanitized, mode: "insensitive" as const } },
          { id: { contains: sanitized, mode: "insensitive" as const } },
          { genome: { contains: sanitized, mode: "insensitive" as const } },
          { walletAddress: { contains: sanitized, mode: "insensitive" as const } },
          ...(isNumeric
            ? [{ blockHeight: parseInt(sanitized, 10) }]
            : []),
        ],
      };

      const [agents, totalAgents] = await Promise.all([
        db.agent.findMany({
          where: agentWhere,
          select: {
            id: true,
            name: true,
            blockHeight: true,
            genome: true,
            tier: true,
            trustScore: true,
            verified: true,
            isAI: true,
            createdAt: true,
          },
          orderBy: { trustScore: "desc" },
          take: limit,
          skip: offset,
        }),
        db.agent.count({ where: agentWhere }),
      ]);

      result.agents = agents.map((a) => ({
        ...a,
        genome: a.genome.slice(0, 16) + "…",
        createdAt: a.createdAt.toISOString(),
      }));
      result.totalAgents = totalAgents;
    }

    // --- Search blocks ---
    if (type === "blocks" || type === "all") {
      const blockWhere = {
        OR: [
          { hash: { contains: sanitized, mode: "insensitive" as const } },
          { genome: { contains: sanitized, mode: "insensitive" as const } },
          ...(isNumeric
            ? [{ height: parseInt(sanitized, 10) }]
            : []),
        ],
      };

      const [blocks, totalBlocks] = await Promise.all([
        db.block.findMany({
          where: blockWhere,
          select: {
            height: true,
            hash: true,
            genome: true,
            txCount: true,
            size: true,
            timestamp: true,
            claimedById: true,
          },
          orderBy: { height: "desc" },
          take: limit,
          skip: offset,
        }),
        db.block.count({ where: blockWhere }),
      ]);

      result.blocks = blocks.map((b) => ({
        ...b,
        genome: b.genome.slice(0, 16) + "…",
        timestamp: b.timestamp.toISOString(),
      }));
      result.totalBlocks = totalBlocks;
    }

    return NextResponse.json(
      { success: true, data: result },
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
  console.error("[search] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
