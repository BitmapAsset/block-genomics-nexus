import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { getAddressInscriptions as ordGetAddressInscriptions } from '@/lib/onchain/ord';

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
  try {
    const address = req.nextUrl.searchParams.get('address');
    if (!address) return error('address query param required', 400);
    if (address.length < 20 || address.length > 100) return error('Invalid address', 400);

    const results: BitmapResult[] = [];

    // ─── LIST CURRENTLY-HELD INSCRIPTIONS (ord-first, fail closed) ───
    // The inscription list comes ONLY from live indexers that report what the
    // wallet holds NOW. We never fabricate a holding on provider outage.
    //   - null  => provider down (fail closed: return empty, no fabrication)
    //   - []     => wallet legitimately holds nothing (real negative)
    let inscriptionIds: string[] | null = null;

    // Provider 1 (PRIMARY): ord — inscriptions currently held by this address.
    inscriptionIds = await ordGetAddressInscriptions(address);

    // Provider 2 (TERTIARY fallback): Unisat UTXO-held inscriptions — only if
    // ord itself was down (null). An ord-reported empty list is a real negative.
    if (inscriptionIds === null) {
      try {
        const res = await fetch(
          `https://open-api.unisat.io/v1/indexer/address/${address}/inscription-utxo-data?cursor=0&size=100`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
        );
        if (res.ok) {
          const data = await res.json();
          const utxos = data?.data?.utxo || [];
          const ids: string[] = [];
          for (const utxo of utxos) {
            for (const insc of (utxo.inscriptions || [])) {
              if (insc.inscriptionId) ids.push(insc.inscriptionId);
            }
          }
          inscriptionIds = ids;
        }
      } catch (e) {
        console.error('[inscriptions/scan] Unisat API error:', e);
      }
    }

    // FAIL CLOSED: no live provider could list the wallet's current inscriptions.
    // Return an empty result rather than fabricating ownership.
    if (inscriptionIds === null) {
      console.warn(`[inscriptions/scan] No on-chain inscription list available for ${address}; failing closed`);
      return success({ inscriptions: results, count: results.length });
    }

    // Content-match each currently-held inscription against .bitmap (limit 50).
    // A hit proves current holding AND block identity together.
    const contentResults = await Promise.allSettled(
      inscriptionIds.slice(0, 50).map(async (id) => {
        // ordinals.com/content is the .bitmap content source.
        try {
          const r = await fetch(`https://ordinals.com/content/${id}`, { signal: AbortSignal.timeout(5000) });
          if (r.ok) {
            const text = await r.text();
            return { id, content: text.trim() };
          }
        } catch { /* fallthrough */ }
        return { id, content: '' };
      })
    );

    for (const r of contentResults) {
      if (r.status !== 'fulfilled' || !r.value.content) continue;
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
