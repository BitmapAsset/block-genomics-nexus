/**
 * Every transaction of a block from an Esplora host, page by page: the fallback
 * for lib/block-summary when mempool's one-call summary cannot be had.
 *
 * Esplora (blockstream.info, mempool.space) serves a block's transactions 25
 * per page at `/block/<hash>/txs/<start>`. A 3,000-tx block is 120 pages, so
 * they are fetched 4 at a time under one overall budget, and a block of more
 * than MAX_WALK_PAGES pages is not walked at all. Every figure comes
 * from the chain: vsize = weight / 4 (what mempool's summary reports), the fee,
 * and the sum of every output (what sizes the Bitmap square). A missing page,
 * a short page or a tx without weight fails the whole fetch: there is no
 * partial block, because one guessed transaction is a different map. The first
 * failed page also aborts every page still in flight.
 *
 * Every request refuses redirects and every body is read under a byte cap
 * (lib/capped-read): a body over its cap is a failed fetch.
 */

import { readCappedJson, readCappedText } from '@/lib/capped-read';

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

// Body caps. A txs page carries 25 whole transactions, witnesses included.
const HASH_MAX_BYTES = 128;
const BLOCK_MAX_BYTES = 64 * 1024;
const PAGE_MAX_BYTES = 16 * 1024 * 1024;

/** Most pages one walk reads (6,000 txs); a bigger block keeps its estimate. */
export const MAX_WALK_PAGES = 240;

/**
 * A signal that aborts when any of `signals` does. `AbortSignal.any` where the
 * runtime has it, otherwise the same by hand.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const native = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof native === 'function') return native.call(AbortSignal, signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

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

  const hashRes = await fetch(`${host}/block-height/${height}`, {
    signal: AbortSignal.timeout(Math.min(8000, left())),
    redirect: 'error',
  });
  if (hashRes.status === 404) throw new EsploraBlockNotFound(`No block at height ${height}`);
  if (!hashRes.ok) throw new Error('Failed to fetch block hash');
  const hash = ((await readCappedText(hashRes, HASH_MAX_BYTES)) ?? '').trim();
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error('Bad block hash');

  const blockRes = await fetch(`${host}/block/${hash}`, {
    signal: AbortSignal.timeout(Math.min(8000, left())),
    redirect: 'error',
  });
  if (!blockRes.ok) throw new Error('Failed to fetch block info');
  const block = ((await readCappedJson(blockRes, BLOCK_MAX_BYTES, 'Block info')) ?? {}) as {
    tx_count?: number;
    size?: number;
    weight?: number;
    timestamp?: number;
  };
  const txCount = block.tx_count;
  if (typeof txCount !== 'number' || !Number.isInteger(txCount) || txCount <= 0) throw new Error('Bad tx_count');

  const pages = Math.ceil(txCount / PAGE);
  if (pages > MAX_WALK_PAGES) throw new Error('Block too large for the paged fallback');
  const txs: EsploraTx[][] = new Array(pages);
  let next = 0;
  let stopped = false;
  const walk = new AbortController();
  const worker = async () => {
    try {
      while (!stopped && next < pages) {
        const p = next++;
        const signal = anySignal([walk.signal, AbortSignal.timeout(Math.min(8000, left()))]);
        const res = await fetch(`${host}/block/${hash}/txs/${p * PAGE}`, { signal, redirect: 'error' });
        if (!res.ok) throw new Error(`Failed to fetch txs page ${p}`);
        const page = await readCappedJson(res, PAGE_MAX_BYTES, `Txs page ${p}`);
        const want = Math.min(PAGE, txCount - p * PAGE);
        if (!Array.isArray(page) || page.length !== want) throw new Error(`Short txs page ${p}`);
        txs[p] = page as EsploraTx[];
      }
    } catch (error) {
      // No worker claims another page, and the pages still in flight are aborted.
      stopped = true;
      walk.abort();
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
