import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { plan, yearly } = await req.json();

    // Stub — will integrate ZEBEDEE or LNbits later
    const prices: Record<string, { monthly: number; yearly: number }> = {
      starter: { monthly: 89, yearly: 71 },      // 10% discount
      professional: { monthly: 269, yearly: 215 },
    };

    const p = prices[plan];
    if (!p) {
      return NextResponse.json({ error: "Invalid plan for Lightning" }, { status: 400 });
    }

    const amountUSD = yearly ? p.yearly : p.monthly;
    const satsAmount = Math.round(amountUSD * 100_000); // mock conversion

    return NextResponse.json({
      invoice: "lnbc" + "x".repeat(100) + "_mock_invoice",
      amountSats: satsAmount,
      amountUSD,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: "waiting",
    });
  } catch (error) {
    console.error("Lightning invoice error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
