/**
 * Block Genomics — POST /api/v1/verify
 *
 * Submit a BIP-322 signed challenge to complete verification.
 * On success, creates or updates the Agent record in the database,
 * generates the block genome, and returns the full agent profile.
 *
 * @module routes/verify
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifySignature,
  getChallenge,
  VerificationError,
} from "../lib/verification";
import {
  fetchBlock,
  fetchTransactions,
  verifyBitmapInscription,
  BlockchainError,
} from "../lib/blockchain";
import { generateGenome } from "../lib/genome";
import { validateString } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyRequestBody {
  challengeId: string;
  address: string;
  signature: string;
  agentName?: string;
  isAI?: boolean;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `POST /api/v1/verify`
 *
 * Request body:
 * ```json
 * {
 *   "challengeId": "abc123...",
 *   "address": "bc1q...",
 *   "signature": "base64...",
 *   "agentName": "My Agent",
 *   "isAI": false
 * }
 * ```
 *
 * Success response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "agent": { ... },
 *     "genome": "64-hex-chars",
 *     "trustScore": 72,
 *     "block": { ... }
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // --- Rate limit (stricter — verification is expensive) ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`verify:${ip}`, { maxRequests: 5, windowMs: 60_000 });

    // --- Parse body ---
    let body: VerifyRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400, headers: corsHeaders() },
      );
    }

    // --- Validate inputs ---
    const challengeId = validateString(body.challengeId, "challengeId", 1, 64);
    const address = validateString(body.address, "address", 20, 128);
    const signature = validateString(body.signature, "signature", 10, 1024);
    const agentName = body.agentName
      ? validateString(body.agentName, "agentName", 1, 128)
      : undefined;
    const isAI = typeof body.isAI === "boolean" ? body.isAI : false;

    // --- Verify signature against challenge ---
    const result = verifySignature(challengeId, address, signature);

    if (!result.valid || !result.challenge) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.reason ?? "SIGNATURE_INVALID",
            message: `Verification failed: ${result.reason ?? "unknown"}`,
          },
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    const challenge = result.challenge;

    // --- Optionally verify Bitmap ownership via Hiro ---
    // Non-blocking; we log the result but don't fail verification
    let bitmapOwned = false;
    try {
      const bitmapCheck = await verifyBitmapInscription(address, challenge.blockHeight);
      bitmapOwned = bitmapCheck.owned;
    } catch {
      // Bitmap check is best-effort; Hiro API may be unavailable
    }

    // --- Fetch block + generate genome ---
    const block = await fetchBlock(challenge.blockHeight);
    const transactions = await fetchTransactions(block.id);
    const genomeResult = generateGenome(block, transactions);

    // --- Agent ID ---
    const agentId = `bg_${genomeResult.genome.slice(0, 16)}`;
    const displayName = agentName ?? challenge.agentId;

    // --- Upsert agent in database ---
    const agent = await db.agent.upsert({
      where: { id: agentId },
      create: {
        id: agentId,
        name: displayName,
        blockHeight: challenge.blockHeight,
        blockHash: block.id,
        genome: genomeResult.genome,
        tier: 1,
        trustScore: genomeResult.trustComponents.total,
        trustComponents: genomeResult.trustComponents as unknown as Record<string, unknown>,
        walletAddress: address,
        isAI,
        verified: true,
        verifiedAt: new Date(),
      },
      update: {
        trustScore: genomeResult.trustComponents.total,
        trustComponents: genomeResult.trustComponents as unknown as Record<string, unknown>,
        walletAddress: address,
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // --- Upsert block cache ---
    await db.block.upsert({
      where: { height: block.height },
      create: {
        height: block.height,
        hash: block.id,
        merkleRoot: block.merkle_root,
        previousHash: block.previousblockhash,
        timestamp: new Date(block.timestamp * 1_000),
        nonce: BigInt(block.nonce),
        bits: String(block.bits),
        difficulty: block.difficulty,
        txCount: block.tx_count,
        size: block.size,
        weight: block.weight,
        genome: genomeResult.genome,
        traits: genomeResult.traits.notable.map((n) => ({ trait: n, value: true })),
        claimedById: agentId,
      },
      update: {
        genome: genomeResult.genome,
        claimedById: agentId,
      },
    });

    // --- Record verification event ---
    await db.verification.create({
      data: {
        agentId: agent.id,
        challengeMessage: challenge.message,
        challengeNonce: challenge.nonce,
        challengeTimestamp: new Date(challenge.timestamp),
        signature,
        signerAddress: address,
        blockHeight: challenge.blockHeight,
        blockHash: block.id,
        status: "VERIFIED",
        expiresAt: new Date(challenge.expiresAt),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          agent: {
            id: agent.id,
            name: agent.name,
            blockHeight: agent.blockHeight,
            genome: agent.genome,
            tier: agent.tier,
            trustScore: agent.trustScore,
            isAI: agent.isAI,
            verified: agent.verified,
            verifiedAt: agent.verifiedAt?.toISOString(),
          },
          genome: genomeResult.genome,
          dnaSequence: genomeResult.dnaSequence,
          traits: genomeResult.traits,
          trustScore: genomeResult.trustComponents.total,
          trustComponents: genomeResult.trustComponents,
          analysis: genomeResult.analysis,
          bitmapOwned,
          block: {
            height: block.height,
            hash: block.id,
            timestamp: block.timestamp,
            txCount: block.tx_count,
          },
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
  console.error("[verify] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
