// ord recursive endpoints (docs/src/inscriptions/recursion.md). These carry
// ord's backwards-compatibility promise, unlike the JSON API, which is off on
// most ordinals.com backends anyway (406 "JSON API disabled").
//
// Every method: null on 404 (a definitive "no such thing"); throws
// SourceUnavailableError on network failure or a non-404 error status.

import { fromHex } from '../bytes';
import type { Limiter } from '../limiter';

export const DEFAULT_ORD_ORIGIN = 'https://ordinals.com';

export class SourceUnavailableError extends Error {
  constructor(
    readonly source: string,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

/** The /r/inscription/<id> fields the resolver reads. */
export interface OrdInscription {
  id: string;
  number: number;
  height: number;
  sat: number | null;
  satpoint: string;
  address: string | null;
  content_type: string | null;
  charms: string[];
  delegate: string | null;
  value: number | null;
}

export class OrdClient {
  constructor(
    private readonly limiter: Limiter,
    readonly origin: string = DEFAULT_ORD_ORIGIN,
  ) {}

  private async getJson(path: string, signal?: AbortSignal, lane?: 'block'): Promise<unknown | null> {
    const url = this.origin + path;
    let res;
    try {
      res = await this.limiter.get(url, { accept: 'application/json', signal, lane });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new SourceUnavailableError('ord', url, `ord unreachable: ${(e as Error).message}`);
    }
    if (res.status === 404) return null;
    if (res.status !== 200) throw new SourceUnavailableError('ord', url, `ord ${path} answered HTTP ${res.status}`);
    try {
      return JSON.parse(new TextDecoder().decode(res.bytes));
    } catch {
      throw new SourceUnavailableError('ord', url, `ord ${path} returned invalid JSON`);
    }
  }

  async blockHeight(signal?: AbortSignal): Promise<number> {
    const v = await this.getJson('/r/blockheight', signal);
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
      throw new SourceUnavailableError('ord', this.origin + '/r/blockheight', 'ord tip is not a number');
    }
    return v;
  }

  async blockHash(height: number, signal?: AbortSignal): Promise<string | null> {
    const v = await this.getJson(`/r/blockhash/${height}`, signal);
    if (v === null) return null;
    if (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v)) {
      throw new SourceUnavailableError('ord', this.origin + `/r/blockhash/${height}`, 'ord block hash malformed');
    }
    return v;
  }

  /** Consensus-serialized block bytes. Routed through the /r/block lane. */
  async block(heightOrHash: number | string, signal?: AbortSignal): Promise<Uint8Array | null> {
    const v = await this.getJson(`/r/block/${heightOrHash}`, signal, 'block');
    if (v === null) return null;
    if (typeof v !== 'string') throw new SourceUnavailableError('ord', this.origin + `/r/block/${heightOrHash}`, 'ord block is not hex');
    return fromHex(v);
  }

  async tx(txid: string, signal?: AbortSignal): Promise<Uint8Array | null> {
    const v = await this.getJson(`/r/tx/${txid}`, signal);
    if (v === null) return null;
    if (typeof v !== 'string') throw new SourceUnavailableError('ord', this.origin + `/r/tx/${txid}`, 'ord tx is not hex');
    return fromHex(v);
  }

  async inscription(id: string, signal?: AbortSignal): Promise<OrdInscription | null> {
    const v = (await this.getJson(`/r/inscription/${id}`, signal)) as Partial<OrdInscription> | null;
    if (v === null) return null;
    if (typeof v !== 'object' || typeof v.id !== 'string' || typeof v.height !== 'number' || typeof v.number !== 'number' || typeof v.satpoint !== 'string') {
      throw new SourceUnavailableError('ord', this.origin + `/r/inscription/${id}`, 'ord inscription malformed');
    }
    return {
      id: v.id,
      number: v.number,
      height: v.height,
      sat: typeof v.sat === 'number' ? v.sat : null,
      satpoint: v.satpoint,
      address: typeof v.address === 'string' ? v.address : null,
      content_type: typeof v.content_type === 'string' ? v.content_type : null,
      charms: Array.isArray(v.charms) ? v.charms.filter((c): c is string => typeof c === 'string') : [],
      delegate: typeof v.delegate === 'string' ? v.delegate : null,
      value: typeof v.value === 'number' ? v.value : null,
    };
  }

  /** Inscription id at `index` on `sat` (needs ord's sat index, which ordinals.com has). */
  async satAt(sat: number, index: number, signal?: AbortSignal): Promise<string | null> {
    const v = (await this.getJson(`/r/sat/${sat}/at/${index}`, signal)) as { id?: unknown } | null;
    if (v === null) return null;
    return typeof v.id === 'string' ? v.id : null;
  }

  /** Raw /content bytes (used for OCI pages). */
  async content(id: string, signal?: AbortSignal): Promise<Uint8Array | null> {
    const url = `${this.origin}/content/${id}`;
    let res;
    try {
      res = await this.limiter.get(url, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new SourceUnavailableError('ord', url, `ord unreachable: ${(e as Error).message}`);
    }
    if (res.status === 404) return null;
    if (res.status !== 200) throw new SourceUnavailableError('ord', url, `ord /content answered HTTP ${res.status}`);
    return res.bytes;
  }
}
