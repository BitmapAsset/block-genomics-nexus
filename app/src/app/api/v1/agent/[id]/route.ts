import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/agent/[id]
 *
 * Retrieve agent profile, trust score, and stats.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Agent ID is required" },
      { status: 400 }
    );
  }

  // TODO: Implement agent lookup
  // 1. Query agent by ID from database
  // 2. Compute or retrieve trust score components
  // 3. Fetch recent verification history
  // 4. Return agent profile with stats

  return NextResponse.json(
    {
      error: "Not implemented",
      message: `Agent ${id} lookup coming soon`,
    },
    { status: 501 }
  );
}
