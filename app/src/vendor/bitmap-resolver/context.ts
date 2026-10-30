// Per-call context: clients, stores and the running source report.
//
// A process-wide limiter and store are the defaults so repeated calls share
// the ordinals.com budget and every immutable fact is fetched once per process.

import { Limiter, type LimiterOptions } from './limiter';
import { DEFAULT_ESPLORA_ORIGINS, EsploraClient } from './sources/esplora';
import { DEFAULT_ORD_ORIGIN, OrdClient } from './sources/ord';
import { memoryStores, type Stores } from './stores';
import type { SourceName, SourceReport } from './types';

export interface ClientOptions {
  /** fetch to use; a limiter is created for it and reused across calls. */
  fetch?: typeof fetch;
  /** A limiter to share; takes precedence over `fetch`. */
  limiter?: Limiter;
  origins?: { ord?: string; esplora?: string[] };
  stores?: Stores;
  signal?: AbortSignal;
  /** Clock for `at` / `generatedAt` stamps (tests). */
  now?: () => Date;
}

export const DEFAULT_LIMITS: LimiterOptions = {
  hosts: {
    'https://ordinals.com': { rps: 2, burst: 6 },
    'https://blockstream.info': { rps: 2, burst: 4 },
    'https://mempool.space': { rps: 2, burst: 4 },
  },
  blockLaneGapMs: 5000,
};

let sharedLimiter: Limiter | null = null;
const limiterByFetch = new WeakMap<typeof fetch, Limiter>();
let sharedStores: Stores | null = null;

export function defaultLimiter(): Limiter {
  if (!sharedLimiter) sharedLimiter = new Limiter(DEFAULT_LIMITS);
  return sharedLimiter;
}

function limiterFor(opts: ClientOptions): Limiter {
  if (opts.limiter) return opts.limiter;
  if (opts.fetch) {
    let l = limiterByFetch.get(opts.fetch);
    if (!l) {
      l = new Limiter({ ...DEFAULT_LIMITS, fetch: opts.fetch });
      limiterByFetch.set(opts.fetch, l);
    }
    return l;
  }
  return defaultLimiter();
}

export class Context {
  readonly ord: OrdClient;
  readonly esplora: EsploraClient;
  readonly stores: Stores;
  readonly signal?: AbortSignal;
  readonly now: () => Date;
  private readonly report = new Map<SourceName, SourceReport>();

  constructor(opts: ClientOptions) {
    const limiter = limiterFor(opts);
    this.ord = new OrdClient(limiter, opts.origins?.ord ?? DEFAULT_ORD_ORIGIN);
    this.esplora = new EsploraClient(limiter, opts.origins?.esplora ?? DEFAULT_ESPLORA_ORIGINS);
    if (!opts.stores && !sharedStores) sharedStores = memoryStores();
    this.stores = opts.stores ?? (sharedStores as Stores);
    this.signal = opts.signal;
    this.now = opts.now ?? (() => new Date());
  }

  /** Record a source outcome; the worst outcome per source wins. */
  mark(name: SourceName, verdict: SourceReport['verdict'], detail?: string): void {
    const rank = { agree: 0, disagree: 1, unreachable: 2 } as const;
    const prev = this.report.get(name);
    const at = this.now().toISOString();
    if (!prev || rank[verdict] >= rank[prev.verdict]) {
      this.report.set(name, { name, verdict, at, ...(detail ? { detail } : prev?.detail ? { detail: prev.detail } : {}) });
    } else {
      prev.at = at;
    }
  }

  sources(): SourceReport[] {
    const order: SourceName[] = ['oci', 'rblock', 'mempool-raw', 'ord', 'esplora'];
    return order.filter((n) => this.report.has(n)).map((n) => ({ ...(this.report.get(n) as SourceReport) }));
  }
}
