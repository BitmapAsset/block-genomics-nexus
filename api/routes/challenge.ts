/**
 * Block Genomics — POST /api/v1/challenge
 *
 * Issues a BIP-322 verification challenge for a given block height.
 * The client must sign the returned `message` with their wallet
 * and submit it to `/api/v1/verify`.
 *
 * @module routes/challenge
 */

import { NextRequest, NextResponse } from "next/server";
import { createChallenge, VerificationError } from "../lib/verification";
import { fetchBlock, BlockchainError } from "../lib/blockchain";
import { validateString, validateBlockHeight } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeRequestBody {
  blockHeight: number;
  agentId: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `POST /api/v1/challenge`
 *
 * Request body:
 * ```json
 * {
 *   "blockHeight": 500000,
 *   "agentId": "my-agent-name"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "challengeId": "abc123...",
 *     "message": "Block Genomics Agent Verification\n...",
 *     "expiresAt": "2026-02-06T12:05:00.000Z",
 *     "blockHeight": 500000
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`challenge:${ip}`, { maxRequests: 10, windowMs: 60_000 });

    // --- Parse body ---
    let body: ChallengeRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400, headers: corsHeaders() },
      );
    }

    // --- Validate ---
    const blockHeight = validateBlockHeight(body.blockHeight);
    const agentId = validateString(body.agentId, "agentId", 1, 128);

    // --- Verify block exists ---
    await fetchBlock(blockHeight);

    // --- Create challenge ---
    const challenge = createChallenge(agentId, blockHeight);

    return NextResponse.json(
      {
        success: true,
        data: {
          challengeId: challenge.id,
          message: challenge.message,
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          blockHeight: challenge.blockHeight,
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
  if (err instanceof VerificationError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message } },
      { status: err.statusCode, headers: corsHeaders() },
    );
  }
  if (err instanceof BlockchainError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message } },
      { status: err.statusCode, headers: corsHeaders() },
    );
  }
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
  console.error("[challenge] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
