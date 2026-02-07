import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/block/[height]
 *
 * Retrieve block data with verification status and genome info.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const { height } = await params;
  const blockHeight = parseInt(height, 10);

  if (isNaN(blockHeight) || blockHeight < 0) {
    return NextResponse.json(
      { error: "Invalid block height" },
      { status: 400 }
    );
  }

  // TODO: Implement block lookup
  // 1. Query block by height from database (or Bitcoin RPC)
  // 2. Include verification status
  // 3. Include genome data if extracted
  // 4. Include verification history

  return NextResponse.json(
    {
      error: "Not implemented",
      message: `Block #${blockHeight} lookup coming soon`,
    },
    { status: 501 }
  );
}
