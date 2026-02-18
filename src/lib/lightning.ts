/**
 * Lightning Network Payment Integration via Strike API
 * 
 * Lightweight Lightning payments for Block Genomics.
 * Uses Strike API to generate Lightning invoices — no node required.
 * 
 * Flow: Create Invoice → Generate Quote (gets bolt11) → Show QR → Poll for payment
 */

const STRIKE_API_BASE = 'https://api.strike.me/v1';

interface StrikeInvoice {
  invoiceId: string;
  amount: { amount: string; currency: string };
  state: 'UNPAID' | 'PENDING' | 'PAID' | 'CANCELLED';
  created: string;
  correlationId?: string;
  description?: string;
}

interface StrikeQuote {
  quoteId: string;
  lnInvoice: string; // bolt11 Lightning invoice string
  expiration: string;
  expirationInSec: number;
  sourceAmount: { amount: string; currency: string };
  targetAmount: { amount: string; currency: string };
}

export interface LightningPaymentRequest {
  /** Amount in USD (Strike converts to BTC) */
  amountUsd: string;
  /** What this payment is for */
  description: string;
  /** Unique ID to prevent duplicate invoices */
  correlationId: string;
}

export interface LightningPaymentResult {
  invoiceId: string;
  quoteId: string;
  bolt11: string;
  expiresAt: string;
  expirationInSec: number;
  amountBtc: string;
  amountUsd: string;
}

/**
 * Create a Lightning invoice via Strike API.
 * Server-side only — requires STRIKE_API_KEY env var.
 */
export async function createLightningInvoice(
  req: LightningPaymentRequest
): Promise<LightningPaymentResult> {
  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) throw new Error('STRIKE_API_KEY not configured');

  // Step 1: Create invoice
  const invoiceRes = await fetch(`${STRIKE_API_BASE}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      correlationId: req.correlationId,
      description: req.description,
      amount: {
        amount: req.amountUsd,
        currency: 'USD',
      },
    }),
  });

  if (!invoiceRes.ok) {
    const err = await invoiceRes.text();
    throw new Error(`Strike invoice creation failed: ${invoiceRes.status}`);
  }

  const invoice: StrikeInvoice = await invoiceRes.json();

  // Step 2: Generate quote (gets the bolt11 Lightning invoice)
  const quoteRes = await fetch(
    `${STRIKE_API_BASE}/invoices/${invoice.invoiceId}/quote`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );

  if (!quoteRes.ok) {
    throw new Error(`Strike quote generation failed: ${quoteRes.status}`);
  }

  const quote: StrikeQuote = await quoteRes.json();

  return {
    invoiceId: invoice.invoiceId,
    quoteId: quote.quoteId,
    bolt11: quote.lnInvoice,
    expiresAt: quote.expiration,
    expirationInSec: quote.expirationInSec,
    amountBtc: quote.sourceAmount.amount,
    amountUsd: req.amountUsd,
  };
}

/**
 * Check if an invoice has been paid.
 * Server-side only.
 */
export async function checkInvoiceStatus(
  invoiceId: string
): Promise<{ paid: boolean; state: string }> {
  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) throw new Error('STRIKE_API_KEY not configured');

  const res = await fetch(`${STRIKE_API_BASE}/invoices/${invoiceId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) throw new Error(`Strike invoice check failed: ${res.status}`);

  const invoice: StrikeInvoice = await res.json();
  return {
    paid: invoice.state === 'PAID',
    state: invoice.state,
  };
}
