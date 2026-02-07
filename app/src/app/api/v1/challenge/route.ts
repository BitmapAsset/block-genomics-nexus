import { NextRequest, NextResponse } from "next/server";
import type { ChallengeRequest } from "@/types";

/**
 * POST /api/v1/challenge
 *
 * Issue a verification challenge for a specific block.
 * The agent receives a challenge with parameters they must solve.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChallengeRequest;

    if (!body.blockHeight || !body.agentId) {
      return NextResponse.json(
        { error: "blockHeight and agentId are required" },
        { status: 400 }
      );
    }

    // TODO: Implement challenge generation
    // 1. Validate block exists
    // 2. Validate agent exists and is eligible
    // 3. Generate challenge based on type and difficulty
    // 4. Store challenge with expiration
    // 5. Return challenge to agent

    return NextResponse.json(
      {
        error: "Not implemented",
        message: "Challenge generation coming soon",
      },
      { status: 501 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
