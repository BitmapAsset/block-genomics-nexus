// Polite HTTP for public indexers.
//
// ordinals.com is one public ord deployment with no published rate limit and no
// edge cache on /r/*: every /r/block call is a Core getblock on their node. So,
// per process and per host:
//   - a token bucket (default 2 requests/s sustained, burst 6);
//   - a separate lane for /r/block: one request in flight, starts >= 5 s apart;
//   - single-flight: concurrent GETs of one URL share one request;
//   - 429 and 5xx: retry with exponential backoff and jitter, honouring
//     Retry-After; a bounded number of times.
// Responses are buffered so single-flight callers can all read the body.

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, Math.max(0, ms));
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError(signal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

export interface FetchResult {
  url: string;
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  bytes: Uint8Array;
}

export interface HostPolicy {
  rps: number;
  burst: number;
}

export interface LimiterOptions {
  fetch?: typeof fetch;
  clock?: Clock;
  random?: () => number;
  /** Per-origin policy (e.g. {"https://ordinals.com": {rps: 2, burst: 6}}). */
  hosts?: Record<string, HostPolicy>;
  /** Policy for origins not listed in `hosts`. */
  defaultPolicy?: HostPolicy;
  /** Minimum gap between /r/block request starts. */
  blockLaneGapMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Longest Retry-After we will sit out before giving up. */
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  blockTimeoutMs?: number;
  /** Sent where the platform allows it (Node); browsers ignore it. */
  userAgent?: string;
}

export interface RequestOptions {
  /** 'block' routes through the single /r/block lane. */
  lane?: 'block';
  accept?: string;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

class TokenBucket {
  private tokens: number;
  private last: number;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly policy: HostPolicy,
    private readonly clock: Clock,
  ) {
    this.tokens = policy.burst;
    this.last = clock.now();
  }

  take(signal?: AbortSignal): Promise<void> {
    const run = async (): Promise<void> => {
      for (;;) {
        const now = this.clock.now();
        this.tokens = Math.min(this.policy.burst, this.tokens + ((now - this.last) / 1000) * this.policy.rps);
        this.last = now;
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        await this.clock.sleep(Math.ceil(((1 - this.tokens) / this.policy.rps) * 1000), signal);
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

class Lane {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly gapMs: number,
    private readonly clock: Clock,
  ) {}

  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const go = async (): Promise<T> => {
      const wait = this.lastStart + this.gapMs - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait, signal);
      this.lastStart = this.clock.now();
      return fn();
    };
    const p = this.chain.then(go, go);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

export interface LimiterStats {
  requests: Record<string, number>;
  retries: number;
}

export class Limiter {
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly lanes = new Map<string, Lane>();
  private readonly inflight = new Map<string, Promise<FetchResult>>();
  private readonly counts: Record<string, number> = {};
  private retryCount = 0;

  constructor(private readonly opts: LimiterOptions = {}) {
    const f = opts.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) throw new Error('no fetch available; pass one in LimiterOptions.fetch');
    this.fetchImpl = f;
    this.clock = opts.clock ?? realClock;
    this.random = opts.random ?? Math.random;
  }

  stats(): LimiterStats {
    return { requests: { ...this.counts }, retries: this.retryCount };
  }

  /** GET with the host's limits. Resolves with any HTTP status; throws on network failure. */
  get(url: string, options: RequestOptions = {}): Promise<FetchResult> {
    const key = `${options.lane ?? ''} ${url}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.getWithRetries(url, options).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private policyFor(origin: string): HostPolicy {
    return this.opts.hosts?.[origin] ?? this.opts.defaultPolicy ?? { rps: 2, burst: 6 };
  }

  private bucket(origin: string): TokenBucket {
    let b = this.buckets.get(origin);
    if (!b) {
      b = new TokenBucket(this.policyFor(origin), this.clock);
      this.buckets.set(origin, b);
    }
    return b;
  }

  private lane(origin: string): Lane {
    let l = this.lanes.get(origin);
    if (!l) {
      l = new Lane(this.opts.blockLaneGapMs ?? 5000, this.clock);
      this.lanes.set(origin, l);
    }
    return l;
  }

  private async getWithRetries(url: string, options: RequestOptions): Promise<FetchResult> {
    const origin = new URL(url).origin;
    const maxRetries = this.opts.maxRetries ?? 3;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let result: FetchResult | null = null;
      try {
        const once = async () => {
          await this.bucket(origin).take(options.signal);
          return this.fetchOnce(url, options);
        };
        result = options.lane === 'block' ? await this.lane(origin).run(once, options.signal) : await once();
      } catch (e) {
        if (options.signal?.aborted) throw e;
        lastError = e;
      }
      if (result && result.status !== 429 && result.status < 500) return result;
      if (attempt === maxRetries) {
        if (result) return result;
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
      this.retryCount++;
      await this.clock.sleep(this.backoffMs(attempt, result), options.signal);
    }
    throw new Error('unreachable');
  }

  private backoffMs(attempt: number, result: FetchResult | null): number {
    const retryAfter = result?.headers['retry-after'];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, this.opts.maxRetryAfterMs ?? 120_000);
    }
    const base = this.opts.baseBackoffMs ?? 1000;
    const cap = this.opts.maxBackoffMs ?? 30_000;
    const exp = Math.min(cap, base * 2 ** attempt);
    return Math.round(exp * (0.5 + this.random() / 2));
  }

  private async fetchOnce(url: string, options: RequestOptions): Promise<FetchResult> {
    if (options.signal?.aborted) throw abortError(options.signal);
    const origin = new URL(url).origin;
    this.counts[origin] = (this.counts[origin] ?? 0) + 1;
    const controller = new AbortController();
    const timeoutMs = options.lane === 'block' ? (this.opts.blockTimeoutMs ?? 60_000) : (this.opts.timeoutMs ?? 20_000);
    const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs} ms: ${url}`)), timeoutMs);
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const headers: Record<string, string> = {};
      if (options.accept) headers.accept = options.accept;
      if (this.opts.userAgent) headers['user-agent'] = this.opts.userAgent;
      const res = await this.fetchImpl(url, { headers, signal: controller.signal, redirect: 'follow' });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const out: Record<string, string> = {};
      res.headers.forEach((value, name) => {
        out[name.toLowerCase()] = value;
      });
      return { url, status: res.status, headers: out, bytes };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}
