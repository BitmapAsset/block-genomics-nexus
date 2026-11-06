/**
 * Every transaction of a block from an Esplora host, page by page: the fallback
 * for lib/block-summary when mempool's one-call summary cannot be had.
 *
 * Esplora (blockstream.info, mempool.space) serves a block's transactions 25
 * per page at `/block/<hash>/txs/<start>`. A 3,000-tx block is 120 pages, so
 * they are fetched 4 at a time under one overall budget. Every figure comes
 * from the chain: vsize = weight / 4 (what mempool's summary reports), the fee,
 * and the sum of every output (what sizes the Bitmap square). A missing page,
 * a short page or a tx without weight fails the whole fetch: there is no
 * partial block, because one guessed transaction is a different map.
 */

export interface EsploraBlockTxs {
  hash: string;
  txCount: number;
  size: number;
  weight: number;
  timestamp: number;
  vsize: number[];
  fee: (number | null)[];
  value: number[];
}

/** The host has no block at that height. */
export class EsploraBlockNotFound extends Error {}

interface EsploraTx {
  weight?: number;
  fee?: number;
  vout?: { value?: number }[];
}

const PAGE = 25;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The block at `height` from `host` (an Esplora API base such as
 * `https://blockstream.info/api`). Throws `EsploraBlockNotFound` on a 404 for
 * the height and `Error` on anything incomplete or over budget.
 */
export async function fetchEsploraBlockTxs(
  host: string,
  height: number,
  { budgetMs = 25_000, concurrency = 4 }: { budgetMs?: number; concurrency?: number } = {},
): Promise<EsploraBlockTxs> {
  const deadline = Date.now() + budgetMs;
  const left = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error('Esplora block fetch over budget');
    return ms;
  };

  const hashRes = await fetch(`${host}/block-height/${height}`, { signal: AbortSignal.timeout(Math.min(8000, left())) });
  if (hashRes.status === 404) throw new EsploraBlockNotFound(`No block at height ${height}`);
  if (!hashRes.ok) throw new Error('Failed to fetch block hash');
  const hash = (await hashRes.text()).trim();
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error('Bad block hash');

  const blockRes = await fetch(`${host}/block/${hash}`, { signal: AbortSignal.timeout(Math.min(8000, left())) });
  if (!blockRes.ok) throw new Error('Failed to fetch block info');
  const block = (await blockRes.json()) as { tx_count?: number; size?: number; weight?: number; timestamp?: number };
  const txCount = block.tx_count;
  if (typeof txCount !== 'number' || !Number.isInteger(txCount) || txCount <= 0) throw new Error('Bad tx_count');

  const pages = Math.ceil(txCount / PAGE);
  const txs: EsploraTx[][] = new Array(pages);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    try {
      while (!stopped && next < pages) {
        const p = next++;
        const res = await fetch(`${host}/block/${hash}/txs/${p * PAGE}`, { signal: AbortSignal.timeout(Math.min(8000, left())) });
        if (!res.ok) throw new Error(`Failed to fetch txs page ${p}`);
        const page = (await res.json()) as unknown;
        const want = Math.min(PAGE, txCount - p * PAGE);
        if (!Array.isArray(page) || page.length !== want) throw new Error(`Short txs page ${p}`);
        txs[p] = page as EsploraTx[];
      }
    } catch (error) {
      stopped = true; // In-flight requests may finish; no worker claims another page.
      throw error;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pages) }, worker));

  const all = txs.flat();
  const vsize = all.map((tx) => {
    const w = tx?.weight;
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) throw new Error('Esplora tx without weight');
    return w / 4;
  });
  return {
    hash,
    txCount,
    size: num(block.size) ?? 0,
    weight: num(block.weight) ?? 0,
    timestamp: num(block.timestamp) ?? 0,
    vsize,
    fee: all.map((tx) => num(tx?.fee)),
    value: all.map((tx) => {
      if (!Array.isArray(tx?.vout)) throw new Error('Esplora tx without outputs');
      return tx.vout.reduce((s, o) => s + (num(o?.value) ?? 0), 0);
    }),
  };
}
