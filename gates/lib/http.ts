// The only way a check reaches the network. It holds no credential, takes no headers from a
// caller, talks to four fixed origins, never follows a redirect, and sends one kind of write
// request: a request the site must refuse, from G-OWNER-ONLY only, naming the gate block only.
import { NotRunError } from './types.ts';

export const SITE = 'https://blockgenomics.io';
export const ORIGINS: readonly string[] = [
  SITE,
  'https://blockstream.info',
  'https://registry.npmjs.org',
  'https://api.github.com',
];

// Marks a request that ran out of time (no retry), as against a network error (one retry).
class TimeoutSignal extends Error {}

const USER_AGENT = 'bg-promise-checks (+https://github.com/BitmapAsset/block-genomics-nexus)';
const ACCEPT = 'application/json, text/plain;q=0.9, */*;q=0.1';

export type Answer = {
  status: number;
  headers: Record<string, string>;
  text: string;
  json(): unknown;
};

export type RequestRecord = { method: string; host: string; path: string; status: number; ms: number };

export type Client = {
  get(url: string): Promise<Answer>;
  refusalProbe(path: string, body: Record<string, unknown>): Promise<Answer>;
  requests: RequestRecord[];
};

export type ClientOptions = {
  checkId: string;
  gateBlock: number | null;
  fetchImpl: typeof fetch;
  budget: { left: number };
  cache: Map<string, Answer>;
  timeoutMs?: number;
};

// A path (`/x`) is read on the site; an absolute URL must sit on one of the fixed origins.
// Anything that would land elsewhere (`//host/x`, another scheme or host) throws here.
function resolve(url: string): URL {
  let u: URL;
  if (url.startsWith('/') && !url.startsWith('//')) {
    u = new URL(url, SITE);
  } else if (/^https:\/\//.test(url)) {
    u = new URL(url);
  } else {
    throw new Error(`refused address: ${url}`);
  }
  if (!ORIGINS.includes(u.origin) || u.username !== '' || u.password !== '') {
    throw new Error(`refused origin: ${u.origin}`);
  }
  return u;
}

function makeAnswer(status: number, headers: Headers, text: string): Answer {
  const h: Record<string, string> = {};
  headers.forEach((value, key) => {
    h[key.toLowerCase()] = value;
  });
  return {
    status,
    headers: h,
    text,
    json: () => JSON.parse(text) as unknown,
  };
}

export function createClient(opts: ClientOptions): Client {
  const { checkId, gateBlock, fetchImpl, budget, cache } = opts;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const requests: RequestRecord[] = [];

  // One attempt. Resolves with the answer, or rejects with 'timeout' or the network error.
  async function attempt(u: URL, init: RequestInit): Promise<Answer> {
    const signal = AbortSignal.timeout(timeoutMs);
    const timedOut = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new TimeoutSignal()), { once: true });
    });
    const exchange = (async () => {
      const res = await fetchImpl(u.href, { ...init, signal, redirect: 'manual' });
      const text = await res.text();
      return makeAnswer(res.status, res.headers, text);
    })();
    return Promise.race([exchange, timedOut]);
  }

  async function send(method: 'GET' | 'POST', u: URL, headers: Record<string, string>, body?: string): Promise<Answer> {
    const host = u.host;
    const path = u.pathname + u.search;
    for (let round = 0; round < 2; round += 1) {
      if (budget.left <= 0) throw new NotRunError('request budget of 40 reached');
      budget.left -= 1;
      const t0 = Date.now();
      try {
        const answer = await attempt(u, { method, headers, ...(body === undefined ? {} : { body }) });
        requests.push({ method, host, path, status: answer.status, ms: Date.now() - t0 });
        if (answer.status === 429) throw new NotRunError(`rate limited by ${host}`);
        return answer;
      } catch (err) {
        if (err instanceof NotRunError) throw err;
        requests.push({ method, host, path, status: 0, ms: Date.now() - t0 });
        if (err instanceof TimeoutSignal) throw new NotRunError(`${host} did not answer`);
        // A network error: one retry at once.
      }
    }
    throw new NotRunError(`${host} did not answer`);
  }

  async function get(url: string): Promise<Answer> {
    const u = resolve(url);
    const cached = cache.get(u.href);
    if (cached) return cached;
    const answer = await send('GET', u, { 'user-agent': USER_AGENT, accept: ACCEPT });
    cache.set(u.href, answer);
    return answer;
  }

  async function refusalProbe(path: string, body: Record<string, unknown>): Promise<Answer> {
    if (checkId !== 'G-OWNER-ONLY') throw new Error(`${checkId} may not send a write request`);
    if (gateBlock === null || !Number.isInteger(gateBlock)) throw new Error('no gate block is set');
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error(`refused address: ${path}`);
    const u = resolve(path);
    if (u.origin !== SITE) throw new Error(`refused origin: ${u.origin}`);
    const namesGate = u.pathname.includes(`/blocks/${gateBlock}/`) || body.blockHeight === gateBlock;
    if (!namesGate) throw new Error('a write request must name the gate block');
    return send(
      'POST',
      u,
      { 'user-agent': USER_AGENT, accept: ACCEPT, 'content-type': 'application/json' },
      JSON.stringify(body),
    );
  }

  return { get, refusalProbe, requests };
}

