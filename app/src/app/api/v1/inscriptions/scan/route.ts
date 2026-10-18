import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { scanAddressForBitmaps } from '@/lib/inscription-scan';
import { enforceRateLimit } from '@/lib/api-rate-limit';

/** Each outage gets its own message; both are `onchain_unavailable` to callers. */
const OUTAGE_MESSAGE = {
  list_unavailable: 'On-chain inscription index unavailable — retry shortly',
  content_unavailable: 'On-chain inscription content unavailable — retry shortly',
} as const;

/**
 * GET /api/v1/inscriptions/scan?address=bc1p...
 * Server-side .bitmap inscription scanner — avoids CORS issues with Unisat/ordinals APIs
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-inscriptions-scan', limit: 20 });
  if (rl.response) return rl.response;

  try {
    const address = req.nextUrl.searchParams.get('address');
    if (!address) return error('address query param required', 400);
    if (address.length < 20 || address.length > 100) return error('Invalid address', 400);

    const scan = await scanAddressForBitmaps(address);

    // An outage is NOT a wallet holding nothing. Reporting `success` with an
    // empty array told callers the wallet was empty — indistinguishable from a
    // real negative, and wrong in exactly the case where it mattered. Answer
    // 503 so the caller retries instead of believing a zero.
    if (!scan.ok) {
      return NextResponse.json(
        {
          success: false,
          error: OUTAGE_MESSAGE[scan.reason],
          code: 'onchain_unavailable',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } }
      );
    }

    return success({ inscriptions: scan.inscriptions, count: scan.inscriptions.length });
  } catch (e: unknown) {
    console.error('[inscriptions/scan] Error:', e);
    return error('Failed to scan inscriptions', 500);
  }
}
