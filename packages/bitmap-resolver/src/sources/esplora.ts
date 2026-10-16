// Esplora REST (Blockstream's blockstream.info, mempool.space): the second,
// independent source for block hashes, reveal heights and unspent outputs.
//
// Origins are tried in order; a network failure or 5xx moves to the next one.
// A 404 is definitive and returned as null.

import type { Limiter } from '../limiter.js';
import { SourceUnavailableError } from './ord.js';

export const DEFAULT_ESPLORA_ORIGINS: readonly string[] = ['https://blockstream.info/api', 'https://mempool.space/api'];

export interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_hash?: string };
  vin?: { witness?: string[] }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

export interface EsploraOutspend {
  spent: boolean;
  txid?: string;
  vin?: number;
}

export class EsploraClient {
  /** Origin that answered the most recent call (for the sources list). */
  lastOrigin: string | null = null;

  constructor(
    private readonly limiter: Limiter,
    readonly origins: readonly string[] = DEFAULT_ESPLORA_ORIGINS,
  ) {
    if (origins.length === 0) throw new Error('at least one Esplora origin is required');
  }

  private async get(path: string, signal?: AbortSignal): Promise<Uint8Array | null> {
    const failures: string[] = [];
    for (const origin of this.origins) {
      const url = origin + path;
      try {
        const res = await this.limiter.get(url, { signal });
        if (res.status === 404) {
          this.lastOrigin = origin;
          return null;
        }
        if (res.status === 200) {
          this.lastOrigin = origin;
          return res.bytes;
        }
        failures.push(`${origin}: HTTP ${res.status}`);
      } catch (e) {
        if (signal?.aborted) throw e;
        failures.push(`${origin}: ${(e as Error).message}`);
      }
    }
    throw new SourceUnavailableError('esplora', path, `esplora unreachable (${failures.join('; ')})`);
  }

  private async text(path: string, signal?: AbortSignal): Promise<string | null> {
    const b = await this.get(path, signal);
    return b === null ? null : new TextDecoder().decode(b).trim();
  }

  private async json<T>(path: string, signal?: AbortSignal): Promise<T | null> {
    const t = await this.text(path, signal);
    if (t === null) return null;
    try {
      return JSON.parse(t) as T;
    } catch {
      throw new SourceUnavailableError('esplora', path, `esplora ${path} returned invalid JSON`);
    }
  }

  async tipHeight(signal?: AbortSignal): Promise<number> {
    const t = await this.text('/blocks/tip/height', signal);
    const n = Number(t);
    if (t === null || !Number.isSafeInteger(n)) throw new SourceUnavailableError('esplora', '/blocks/tip/height', 'esplora tip is not a number');
    return n;
  }

  async blockHash(height: number, signal?: AbortSignal): Promise<string | null> {
    const t = await this.text(`/block-height/${height}`, signal);
    if (t === null) return null;
    if (!/^[0-9a-f]{64}$/.test(t)) throw new SourceUnavailableError('esplora', `/block-height/${height}`, 'esplora block hash malformed');
    return t;
  }

  async tx(txid: string, signal?: AbortSignal): Promise<EsploraTx | null> {
    return this.json<EsploraTx>(`/tx/${txid}`, signal);
  }

  async outspend(txid: string, vout: number, signal?: AbortSignal): Promise<EsploraOutspend | null> {
    return this.json<EsploraOutspend>(`/tx/${txid}/outspend/${vout}`, signal);
  }

  /** Raw block bytes by hash: the second byte source for the walk. */
  async blockRaw(hash: string, signal?: AbortSignal): Promise<Uint8Array | null> {
    return this.get(`/block/${hash}/raw`, signal);
  }

  async blockTxids(hash: string, signal?: AbortSignal): Promise<string[] | null> {
    return this.json<string[]>(`/block/${hash}/txids`, signal);
  }
}
