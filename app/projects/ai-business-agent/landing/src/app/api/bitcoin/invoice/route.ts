import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { plan, yearly, lifetime } = await req.json();

    const prices: Record<string, { monthly: number; yearly: number; lifetime?: number }> = {
      starter: { monthly: 89, yearly: 71 },
      professional: { monthly: 269, yearly: 215, lifetime: 899 },
    };

    const p = prices[plan];
    if (!p) {
      return NextResponse.json({ error: "Invalid plan for on-chain" }, { status: 400 });
    }

    const amountUSD = lifetime && p.lifetime ? p.lifetime : yearly ? p.yearly * 12 : p.monthly;
    const mockBtcRate = 95000; // placeholder rate
    const amountBTC = parseFloat((amountUSD / mockBtcRate).toFixed(8));
    const confirmationsRequired = amountUSD >= 500 ? 3 : 1;

    // Stub — would generate unique address via xpub derivation or payment processor
    const address = "bc1q" + "x".repeat(38) + "_mock";

    return NextResponse.json({
      address,
      amountBTC,
      amountUSD,
      btcRate: mockBtcRate,
      confirmationsRequired,
      uri: `bitcoin:${address}?amount=${amountBTC}&label=Naxora+${plan}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      status: "waiting",
      confirmations: 0,
    });
  } catch (error) {
    console.error("Bitcoin invoice error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
