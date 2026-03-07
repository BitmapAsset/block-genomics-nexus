import { NextRequest, NextResponse } from "next/server";

// Placeholder Stripe price IDs — replace with real ones
const PRICE_IDS: Record<string, { monthly: string; yearly: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || "price_starter_monthly_placeholder",
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || "price_starter_yearly_placeholder",
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_pro_monthly_placeholder",
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || "price_pro_yearly_placeholder",
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENT_MONTHLY || "price_ent_monthly_placeholder",
    yearly: process.env.STRIPE_PRICE_ENT_YEARLY || "price_ent_yearly_placeholder",
  },
};

export async function POST(req: NextRequest) {
  try {
    const { plan, yearly } = await req.json();

    const prices = PRICE_IDS[plan];
    if (!prices) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = yearly ? prices.yearly : prices.monthly;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      // Dev mode — return mock URL
      return NextResponse.json({
        url: `https://checkout.stripe.com/pay/mock_${plan}_${yearly ? "yearly" : "monthly"}`,
      });
    }

    // Real Stripe checkout session
    const stripe = require("stripe")(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/#pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
