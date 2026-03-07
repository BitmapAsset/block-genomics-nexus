/**
 * Block Genomics — GET /api/v1/agent/:id
 *
 * Retrieve an agent profile including trust score, delegation info,
 * and verification history.
 *
 * @module routes/agent
 */

import { NextRequest, NextResponse } from "next/server";
import { validateString } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/agent/:id`
 *
 * Path parameter: `id` — the agent ID (e.g. `bg_a3f7...`).
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "bg_a3f7...",
 *     "name": "My Agent",
 *     "blockHeight": 500000,
 *     "genome": "64-hex...",
 *     "tier": 1,
 *     "trustScore": 72,
 *     "trustComponents": { ... },
 *     "verified": true,
 *     "verifiedAt": "2026-02-06T...",
 *     "delegations": [ ... ],
 *     "verificationCount": 3,
 *     "createdAt": "2026-02-06T..."
 *   }
 * }
 * ```
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`agent:${ip}`, { maxRequests: 30, windowMs: 60_000 });

    const { id } = await params;
    const agentId = validateString(id, "id", 1, 64);

    // --- Fetch agent ---
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: {
        delegationsAsParent: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            childAgentId: true,
            tier: true,
            grantedAt: true,
            expiresAt: true,
          },
        },
        delegationsAsChild: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            parentAgentId: true,
            tier: true,
            grantedAt: true,
          },
        },
        _count: {
          select: {
            verifications: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: { code: "AGENT_NOT_FOUND", message: `Agent ${agentId} not found` } },
        { status: 404, headers: corsHeaders() },
      );
    }

    // --- Fetch claimed block info ---
    const block = await db.block.findFirst({
      where: { claimedById: agent.id },
      select: { height: true, hash: true, genome: true, timestamp: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          blockHeight: agent.blockHeight,
          blockHash: agent.blockHash,
          genome: agent.genome,
          tier: agent.tier,
          trustScore: agent.trustScore,
          trustComponents: agent.trustComponents,
          walletAddress: agent.walletAddress,
          isAI: agent.isAI,
          profileColor: agent.profileColor,
          verified: agent.verified,
          verifiedAt: agent.verifiedAt?.toISOString() ?? null,
          createdAt: agent.createdAt.toISOString(),
          updatedAt: agent.updatedAt.toISOString(),
          verificationCount: agent._count.verifications,
          delegationsAsParent: agent.delegationsAsParent.map((d) => ({
            id: d.id,
            childAgentId: d.childAgentId,
            tier: d.tier,
            grantedAt: d.grantedAt.toISOString(),
            expiresAt: d.expiresAt?.toISOString() ?? null,
          })),
          delegationsAsChild: agent.delegationsAsChild.map((d) => ({
            id: d.id,
            parentAgentId: d.parentAgentId,
            tier: d.tier,
            grantedAt: d.grantedAt.toISOString(),
          })),
          block: block
            ? {
                height: block.height,
                hash: block.hash,
                genome: block.genome,
                timestamp: block.timestamp.toISOString(),
              }
            : null,
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
  console.error("[agent] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
