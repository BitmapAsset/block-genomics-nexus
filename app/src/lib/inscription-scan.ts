/**
 * Server-side .bitmap scan of one wallet: the `<n>.bitmap` and
 * `<n>:<i>.bitmap` inscriptions it holds right now.
 *
 * Shared by `GET /api/v1/inscriptions/scan` and the tier resolver, which calls
 * it in-process. The resolver used to fetch that route over HTTP at the origin
 * of the request it was serving, so the host it asked, and whose answer it
 * stored as the wallet's holdings, came from the caller's Host header (CodeQL
 * js/request-forgery). In-process there is no URL to forge.
 */

import { getAddressInscriptions as ordGetAddressInscriptions, getInscriptionContent } from '@/lib/onchain/ord';

export interface BitmapResult {
  type: 'block' | 'parcel';
  height: number;
  parcelIndex?: number;
  inscriptionId: string;
  label: string;
}

/**
 * `ok: false` is an outage, never "the wallet holds nothing": `list_unavailable`
 * when no indexer could list the wallet, `content_unavailable` when a content
 * read failed (a failed read is not a non-match).
 */
export type InscriptionScan =
  | { ok: true; inscriptions: BitmapResult[] }
  | { ok: false; reason: 'list_unavailable' | 'content_unavailable' };

export async function scanAddressForBitmaps(address: string): Promise<InscriptionScan> {
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

  // An outage is NOT a wallet holding nothing. Reporting success with an empty
  // array told callers the wallet was empty — indistinguishable from a real
  // negative, and wrong in exactly the case where it mattered.
  if (inscriptionIds === null) {
    console.warn(`[inscriptions/scan] No on-chain inscription list available for ${address}`);
    return { ok: false, reason: 'list_unavailable' };
  }

  // Content-match each currently-held inscription against .bitmap (limit 50).
  // A hit proves current holding AND block identity together.
  //
  // A content fetch that FAILS is not an inscription that fails to match: it
  // silently shrinks the result set, which is the same empty-success lie in
  // miniature. Any failure aborts the whole scan.
  const contentResults = await Promise.allSettled(
    inscriptionIds.slice(0, 50).map(async (id) => {
      // Same ord host list as the holdings above (ORD_BASE_URLS, tried in
      // order), not a hard-coded ordinals.com: one blocked host must not fail
      // a scan another configured host can answer.
      const content = await getInscriptionContent(id);
      if (content === null) throw new Error(`content/${id} unavailable on every ord host`);
      return { id, content: content.trim() };
    })
  );

  const unreadable = contentResults.filter((r) => r.status === 'rejected');
  if (unreadable.length > 0) {
    console.warn(
      `[inscriptions/scan] ${unreadable.length}/${contentResults.length} content reads failed for ${address}`
    );
    return { ok: false, reason: 'content_unavailable' };
  }

  const results: BitmapResult[] = [];
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

  return { ok: true, inscriptions: results };
}
