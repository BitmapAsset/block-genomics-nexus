/**
 * Block Genomics — GET /api/v1/block/:height
 *
 * Retrieve block data with genome, traits, verification status,
 * and claiming agent info. Fetches from local cache first, then
 * falls back to mempool.space for fresh data.
 *
 * @module routes/block
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchBlock, fetchTransactions, BlockchainError } from "../lib/blockchain";
import { generateGenome } from "../lib/genome";
import { validateBlockHeight } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { corsHeaders } from "../middleware/cors";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/block/:height`
 *
 * Path parameter: `height` — Bitcoin block height (integer >= 0).
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "height": 500000,
 *     "hash": "00000000...",
 *     "genome": "64-hex...",
 *     "traits": { ... },
 *     "trustComponents": { ... },
 *     "analysis": { ... },
 *     "claimedBy": { "id": "bg_...", "name": "..." } | null,
 *     "block": { ... }
 *   }
 * }
 * ```
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ height: string }> },
): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`block:${ip}`, { maxRequests: 20, windowMs: 60_000 });

    const { height } = await params;
    const blockHeight = validateBlockHeight(parseInt(height, 10));

    // --- Check local DB cache first ---
    const cached = await db.block.findUnique({
      where: { height: blockHeight },
      include: {
        claimedBy: {
          select: { id: true, name: true, tier: true, trustScore: true, verified: true },
        },
      },
    });

    if (cached) {
      return NextResponse.json(
        {
          success: true,
          data: {
            height: cached.height,
            hash: cached.hash,
            merkleRoot: cached.merkleRoot,
            previousHash: cached.previousHash,
            timestamp: cached.timestamp.toISOString(),
            nonce: cached.nonce.toString(),
            bits: cached.bits,
            difficulty: cached.difficulty,
            txCount: cached.txCount,
            size: cached.size,
            weight: cached.weight,
            genome: cached.genome,
            traits: cached.traits,
            claimedBy: cached.claimedBy
              ? {
                  id: cached.claimedBy.id,
                  name: cached.claimedBy.name,
                  tier: cached.claimedBy.tier,
                  trustScore: cached.claimedBy.trustScore,
                  verified: cached.claimedBy.verified,
                }
              : null,
            cached: true,
          },
        },
        { status: 200, headers: corsHeaders() },
      );
    }

    // --- Fetch from mempool.space ---
    const block = await fetchBlock(blockHeight);
    const transactions = await fetchTransactions(block.id);
    const genomeResult = generateGenome(block, transactions);

    // --- Cache the block in DB (non-blocking, best-effort) ---
    db.block
      .create({
        data: {
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
        },
      })
      .catch(() => {
        // Ignore duplicate / write errors — caching is best-effort
      });

    return NextResponse.json(
      {
        success: true,
        data: {
          height: block.height,
          hash: block.id,
          merkleRoot: block.merkle_root,
          previousHash: block.previousblockhash,
          timestamp: new Date(block.timestamp * 1_000).toISOString(),
          nonce: String(block.nonce),
          bits: String(block.bits),
          difficulty: block.difficulty,
          txCount: block.tx_count,
          size: block.size,
          weight: block.weight,
          genome: genomeResult.genome,
          dnaSequence: genomeResult.dnaSequence,
          traits: genomeResult.traits,
          trustComponents: genomeResult.trustComponents,
          analysis: genomeResult.analysis,
          claimedBy: null,
          cached: false,
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
  console.error("[block] Unhandled error:", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500, headers: corsHeaders() },
  );
}
