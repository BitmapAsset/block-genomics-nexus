import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';

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

    // Strategy 1: Unisat open API — list wallet inscriptions
    try {
      const res = await fetch(
        `https://open-api.unisat.io/v1/indexer/address/${address}/inscription-utxo-data?cursor=0&size=100`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        const utxos = data?.data?.utxo || [];
        const inscriptionIds: string[] = [];
        for (const utxo of utxos) {
          for (const insc of (utxo.inscriptions || [])) {
            if (insc.inscriptionId) inscriptionIds.push(insc.inscriptionId);
          }
        }

        // Fetch content for each inscription (limit 50)
        const contentResults = await Promise.allSettled(
          inscriptionIds.slice(0, 50).map(async (id) => {
            // Try ordinals.com/content first
            try {
              const r = await fetch(`https://ordinals.com/content/${id}`, { signal: AbortSignal.timeout(5000) });
              if (r.ok) {
                const text = await r.text();
                return { id, content: text.trim() };
              }
            } catch { /* fallthrough */ }
            // Fallback: Unisat content
            try {
              const r = await fetch(`https://open-api.unisat.io/v1/indexer/inscription/content/${id}`, { signal: AbortSignal.timeout(5000) });
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
      }
    } catch (e) {
      console.error('[inscriptions/scan] Unisat API error:', e);
    }

    return success({ inscriptions: results, count: results.length });
  } catch (e: any) {
    console.error('[inscriptions/scan] Error:', e);
    return error('Failed to scan inscriptions', 500);
  }
}
