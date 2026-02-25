/**
 * POST /api/v1/lightning/invoice — Create a Lightning invoice
 * 
 * Body: { amountUsd: string, description: string, correlationId: string }
 * Returns: { bolt11, invoiceId, quoteId, expiresAt, amountBtc, amountUsd }
 */
import { NextResponse } from 'next/server';
import { createLightningInvoice } from '@/lib/lightning';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amountUsd, description, correlationId } = body;

    if (!amountUsd || !description || !correlationId) {
      return NextResponse.json(
        { error: 'Missing required fields: amountUsd, description, correlationId' },
        { status: 400 }
      );
    }

    // Validate amount
    const amount = parseFloat(amountUsd);
    if (isNaN(amount) || amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { error: 'Invalid amount (must be $0.01 — $10,000)' },
        { status: 400 }
      );
    }

    const result = await createLightningInvoice({
      amountUsd: amount.toFixed(2),
      description,
      correlationId,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[Lightning invoice error]', e?.message);
    const isConfig = e?.message?.includes('not configured');
    return NextResponse.json(
      { error: isConfig ? 'Lightning payments are being set up — check back soon!' : 'Failed to create Lightning invoice' },
      { status: isConfig ? 503 : 500 }
    );
  }
}
