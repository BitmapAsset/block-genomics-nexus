import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { getAddressInscriptions as ordGetAddressInscriptions } from '@/lib/onchain/ord';
import { enforceRateLimit } from '@/lib/api-rate-limit';

interface BitmapResult {
  type: 'block' | 'parcel';
  height: number;
  parcelIndex?: number;
  inscriptionId: string;
  label: string;
}

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

    const results: BitmapResult[] = [];

    // ─── LIST CURRENTLY-HELD INSCRIPTIONS ───
    // The list comes ONLY from live indexers reporting what the wallet holds
    // NOW, so a content match below proves holding and block identity together.
    //   - null => no provider answered
    //   - []   => wallet legitimately holds nothing (a real negative)
    //
    // The keyless Unisat call that used to sit here as a fallback answered 403
    // ("exceeded the request limit for unauthenticated requests") on every
    // request, because nothing sets an Authorization header for it. It is gone
    // rather than kept as a fallback that cannot fire.
    const inscriptionIds = await ordGetAddressInscriptions(address);

    // An outage is NOT a wallet holding nothing. Reporting `success` with an
    // empty array told callers the wallet was empty — indistinguishable from a
    // real negative, and wrong in exactly the case where it mattered. Answer
    // 503 so the caller retries instead of believing a zero.
    if (inscriptionIds === null) {
      console.warn(`[inscriptions/scan] No on-chain inscription list available for ${address}`);
      return NextResponse.json(
        {
          success: false,
          error: 'On-chain inscription index unavailable — retry shortly',
          code: 'onchain_unavailable',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } }
      );
    }

    // Content-match each currently-held inscription against .bitmap (limit 50).
    // A hit proves current holding AND block identity together.
    //
    // A content fetch that FAILS is not an inscription that fails to match: it
    // silently shrinks the result set, which is the same empty-success lie in
    // miniature. Any failure aborts the whole scan into the 503 below.
    const contentResults = await Promise.allSettled(
      inscriptionIds.slice(0, 50).map(async (id) => {
        // ordinals.com/content is the .bitmap content source.
        const r = await fetch(`https://ordinals.com/content/${id}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`content/${id} -> ${r.status}`);
        return { id, content: (await r.text()).trim() };
      })
    );

    const unreadable = contentResults.filter((r) => r.status === 'rejected');
    if (unreadable.length > 0) {
      console.warn(
        `[inscriptions/scan] ${unreadable.length}/${contentResults.length} content reads failed for ${address}`
      );
      return NextResponse.json(
        {
          success: false,
          error: 'On-chain inscription content unavailable — retry shortly',
          code: 'onchain_unavailable',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } }
      );
    }

    for (const r of contentResults) {
      if (r.status !== 'fulfilled') continue;
      const { id, content } = r.value;
      const blockMatch = content.match(/^(\d+)\.bitmap$/);
      const parcelMatch = content.match(/^(\d+):(\d+)\.bitmap$/);
      if (blockMatch) {
        const height = parseInt(blockMatch[1], 10);
        results.push({ type: 'block', height, inscriptionId: id, label: `${height.toLocaleString()}.bitmap` });
      } else if (parcelMatch) {
        const height = parseInt(parcelMatch[1], 10);
        const parcelIndex = parseInt(parcelMatch[2], 10);
        results.push({ type: 'parcel', height, parcelIndex, inscriptionId: id, label: `${height.toLocaleString()}:${parcelIndex}.bitmap` });
      }
    }

    return success({ inscriptions: results, count: results.length });
  } catch (e: unknown) {
    console.error('[inscriptions/scan] Error:', e);
    return error('Failed to scan inscriptions', 500);
  }
}
