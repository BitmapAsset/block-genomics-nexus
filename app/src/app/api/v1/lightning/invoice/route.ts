/**
 * POST /api/v1/lightning/invoice — Create a Lightning invoice
 * 
 * Body: { amountUsd: string, description: string, correlationId: string }
 * Returns: { bolt11, invoiceId, quoteId, expiresAt, amountBtc, amountUsd }
 *
 * Every valid body creates a real charge on the platform's ZBD account, so the
 * caller must hold a verified session (bg_vfy_) and is rate limited.
 */
import { NextResponse } from 'next/server';
import { createLightningInvoice } from '@/lib/lightning';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { authenticateSession, sessionTokenFromHeaders } from '@/lib/verified-sessions';

const INVOICE_LIMIT = 10;

export async function POST(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-lightning-invoice', limit: INVOICE_LIMIT });
  if (rl.response) return rl.response;

  const auth = await authenticateSession(sessionTokenFromHeaders(req.headers));
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason ?? 'A verified session is required to create an invoice' },
      { status: auth.status }
    );
  }

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
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : undefined;
    console.error('[Lightning invoice error]', errMessage);
    const isConfig = errMessage?.includes('not configured');
    return NextResponse.json(
      { error: isConfig ? 'Lightning payments are being set up — check back soon!' : 'Failed to create Lightning invoice' },
      { status: isConfig ? 503 : 500 }
    );
  }
}
