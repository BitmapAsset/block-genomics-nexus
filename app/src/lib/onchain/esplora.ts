/**
 * Esplora address client.
 *
 * Esplora is the API both mempool.space and blockstream.info expose, with
 * identical paths and response shapes, so one client covers both and the second
 * is a genuine fallback rather than a second integration.
 *
 * We only ask it one question: which outputs does an address currently hold?
 * Inscription identity is never inferred here — that comes from ord in
 * `ord.ts`. Esplora supplies the UTXO set; ord says what is inscribed on it.
 *
 * SECURITY: fails closed. `null` means "no provider answered" and callers MUST
 * surface a retryable error rather than treating it as "holds nothing".
 */

const ESPLORA_BASES = [
  (process.env.ESPLORA_BASE_URL || 'https://mempool.space/api').replace(/\/+$/, ''),
  'https://blockstream.info/api',
];

const FETCH_TIMEOUT_MS = 8000;

/** `<txid>:<vout>` for every output the address currently holds. */
export async function getAddressOutpoints(address: string): Promise<string[] | null> {
  for (const base of ESPLORA_BASES) {
    try {
      const res = await fetch(`${base}/address/${encodeURIComponent(address)}/utxo`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      if (!Array.isArray(data)) continue;

      const outpoints: string[] = [];
      for (const utxo of data) {
        const txid = (utxo as { txid?: unknown })?.txid;
        const vout = (utxo as { vout?: unknown })?.vout;
        if (typeof txid === 'string' && txid.length > 0 && Number.isInteger(vout)) {
          outpoints.push(`${txid}:${vout}`);
        }
      }
      return outpoints;
    } catch (e) {
      console.warn(`[esplora] ${base} address lookup failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
