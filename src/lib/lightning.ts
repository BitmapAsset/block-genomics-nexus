/**
 * Lightning Network Payment Integration via ZEBEDEE (ZBD) API
 * 
 * Lightweight Lightning payments for Block Genomics.
 * Uses ZBD API to generate Lightning invoices — no node required.
 * 
 * Flow: Create Charge (gets bolt11) → Show QR → Poll for payment
 * 
 * ZBD amounts are in millisatoshis (1 sat = 1000 msats).
 * We accept USD on the frontend and convert server-side.
 */

const ZBD_API_BASE = 'https://api.zebedee.io/v1';

interface ZBDCharge {
  id: string;
  unit: string;
  amount: string; // millisatoshis
  createdAt: string;
  expiresAt: string;
  internalId: string;
  description: string;
  callbackUrl: string;
  status: 'pending' | 'completed' | 'expired' | 'error';
  invoice: {
    request: string; // bolt11 Lightning invoice
    uri: string;
    expiresAt: string;
  };
}

interface ZBDChargeResponse {
  success: boolean;
  message: string;
  data: ZBDCharge;
}

interface ZBDBtcUsdResponse {
  success: boolean;
  data: {
    btcUsdPrice: string;
    btcUsdTimestamp: string;
  };
}

export interface LightningPaymentRequest {
  /** Amount in USD */
  amountUsd: string;
  /** What this payment is for */
  description: string;
  /** Unique ID to prevent duplicate invoices */
  correlationId: string;
}

export interface LightningPaymentResult {
  invoiceId: string;
  quoteId: string; // same as invoiceId for ZBD
  bolt11: string;
  expiresAt: string;
  expirationInSec: number;
  amountBtc: string;
  amountUsd: string;
}

/**
 * Convert USD to millisatoshis using ZBD's price feed.
 */
async function usdToMsats(usd: number, apiKey: string): Promise<string> {
  const res = await fetch(`${ZBD_API_BASE}/btcusd`, {
    headers: { apikey: apiKey },
  });
  if (!res.ok) throw new Error(`ZBD price feed failed: ${res.status}`);
  const data: ZBDBtcUsdResponse = await res.json();
  const btcPrice = parseFloat(data.data.btcUsdPrice);
  // USD → BTC → sats → msats
  const btcAmount = usd / btcPrice;
  const msats = Math.round(btcAmount * 1e8 * 1000);
  return msats.toString();
}

/**
 * Create a Lightning invoice via ZBD API.
 * Server-side only — requires ZBD_API_KEY env var.
 */
export async function createLightningInvoice(
  req: LightningPaymentRequest
): Promise<LightningPaymentResult> {
  const apiKey = process.env.ZBD_API_KEY;
  if (!apiKey) throw new Error('ZBD_API_KEY not configured');

  const usdAmount = parseFloat(req.amountUsd);
  const msats = await usdToMsats(usdAmount, apiKey);

  const res = await fetch(`${ZBD_API_BASE}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      amount: msats,
      description: req.description,
      expiresIn: 600, // 10 minutes
      internalId: req.correlationId,
    }),
  });

  if (!res.ok) {
    throw new Error(`ZBD charge creation failed: ${res.status}`);
  }

  const result: ZBDChargeResponse = await res.json();
  if (!result.success) {
    throw new Error(`ZBD charge error: ${result.message}`);
  }

  const charge = result.data;
  const expiresAt = charge.invoice.expiresAt || charge.expiresAt;
  const expirationInSec = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  // Convert msats back to BTC for display
  const amountBtc = (parseInt(msats) / 1e8 / 1000).toFixed(8);

  return {
    invoiceId: charge.id,
    quoteId: charge.id,
    bolt11: charge.invoice.request,
    expiresAt,
    expirationInSec,
    amountBtc,
    amountUsd: req.amountUsd,
  };
}

/**
 * Check if a charge has been paid.
 * Server-side only.
 */
export async function checkInvoiceStatus(
  invoiceId: string
): Promise<{ paid: boolean; state: string }> {
  const apiKey = process.env.ZBD_API_KEY;
  if (!apiKey) throw new Error('ZBD_API_KEY not configured');

  const res = await fetch(`${ZBD_API_BASE}/charges/${invoiceId}`, {
    headers: { apikey: apiKey },
  });

  if (!res.ok) throw new Error(`ZBD charge check failed: ${res.status}`);

  const result: ZBDChargeResponse = await res.json();
  return {
    paid: result.data.status === 'completed',
    state: result.data.status,
  };
}
