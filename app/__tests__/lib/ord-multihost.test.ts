/**
 * The ord client survives a blocked host.
 *
 * On 2026-10-22 ordinals.com started answering every scripted request with a
 * Cloudflare 403 block page. The client had one base URL and no failover, so
 * every holder lookup failed. These cases pin the multi-host behaviour:
 * `ORD_BASE_URLS` parsing, failover order, the per-host cooldown, the
 * User-Agent, and that credentials in a configured URL never reach a log.
 */

import pkg from '../../package.json';
import {
  parseOrdBaseUrls,
  ordGet,
  getInscriptionOwner,
  getInscriptionContent,
  getStatus,
  getOrdHosts,
  getOrdHostHealth,
  __resetOrdClientForTest,
  HOST_COOLDOWN_MS,
} from '@/lib/onchain/ord';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const INSCRIPTION = 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0';
const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const SATPOINT = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:3:0';

const realFetch = global.fetch;
let calls: { url: string; headers: Record<string, string> }[] = [];
let warn: jest.SpyInstance;

function serve(handler: Handler) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init.headers as Record<string, string>) } });
    return handler(url, init);
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const blockPage = () =>
  new Response('<!DOCTYPE html><title>Attention Required! | Cloudflare</title>', {
    status: 403,
    headers: { 'content-type': 'text/html' },
  });
const holderBody = { address: HOLDER, satpoint: SATPOINT, id: INSCRIPTION };

beforeEach(() => {
  calls = [];
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __resetOrdClientForTest({ list: 'https://a.example,https://b.example', single: null, throttleMs: 0, backoffMs: 0 });
});

afterEach(() => {
  warn.mockRestore();
  jest.restoreAllMocks();
  global.fetch = realFetch;
});

afterAll(() => {
  __resetOrdClientForTest();
});

describe('ORD_BASE_URLS parsing', () => {
  it('defaults to ordinals.com when nothing is configured', () => {
    expect(parseOrdBaseUrls(undefined, undefined).map((h) => h.base)).toEqual(['https://ordinals.com']);
    expect(parseOrdBaseUrls('', '  ').map((h) => h.label)).toEqual(['ordinals.com']);
  });

  it('trims spaces, removes end slashes and duplicates, keeps order', () => {
    const hosts = parseOrdBaseUrls(' https://a.example/ , https://b.example//,https://a.example ,, ', undefined);
    expect(hosts.map((h) => h.base)).toEqual(['https://a.example', 'https://b.example']);
  });

  it('puts ORD_BASE_URL first and does not repeat it', () => {
    const hosts = parseOrdBaseUrls('https://a.example,https://b.example', 'https://b.example/');
    expect(hosts.map((h) => h.base)).toEqual(['https://b.example', 'https://a.example']);
  });

  it('treats host case as the same host and keeps a path prefix', () => {
    const hosts = parseOrdBaseUrls('HTTPS://ORD.Example.COM/,https://ord.example.com,https://self.example/ord/', undefined);
    expect(hosts.map((h) => h.base)).toEqual(['https://ord.example.com', 'https://self.example/ord']);
    expect(hosts[1].label).toBe('self.example/ord');
  });

  it('skips entries that are not http(s) URLs, naming the position and never the value', () => {
    const hosts = parseOrdBaseUrls('ftp://x.example,not a url,https://ok.example', undefined);
    expect(hosts.map((h) => h.base)).toEqual(['https://ok.example']);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('#1');
    expect(logged).not.toContain('ftp://x.example');
  });

  it('falls back to the default list when every configured entry is unusable', () => {
    expect(parseOrdBaseUrls('nope,also nope', undefined).map((h) => h.base)).toEqual(['https://ordinals.com']);
  });

  it('lifts credentials out of the URL: label and base carry none', () => {
    const [host] = parseOrdBaseUrls(undefined, 'https://user:s3cret@ord.example/');
    expect(host.base).toBe('https://ord.example');
    expect(host.label).toBe('ord.example');
    expect(host.authorization).toBe(`Basic ${Buffer.from('user:s3cret').toString('base64')}`);
  });
});

describe('failover', () => {
  it('a 403 block on host 1 is retried once, then host 2 answers', async () => {
    serve((url) => (url.startsWith('https://a.example') ? blockPage() : json(holderBody)));

    const owner = await getInscriptionOwner(INSCRIPTION);

    expect(owner).toEqual({ address: HOLDER, satpoint: SATPOINT, source: 'b.example' });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['a.example', 'a.example', 'b.example']);
    expect(calls[2].url).toBe(`https://b.example/r/inscription/${INSCRIPTION}`);
  });

  it.each([
    ['429', () => new Response('slow down', { status: 429 })],
    ['500', () => new Response('oops', { status: 500 })],
    ['503', () => new Response('maintenance', { status: 503 })],
    ['a 200 block page where JSON was asked for', () => new Response('<html>challenge</html>', { status: 200 })],
  ])('fails over on %s', async (_label, bad) => {
    serve((url) => (url.startsWith('https://a.example') ? bad() : json(holderBody)));
    expect((await getInscriptionOwner(INSCRIPTION))?.source).toBe('b.example');
  });

  it('fails over on a network error', async () => {
    serve((url) => {
      if (url.startsWith('https://a.example')) throw new TypeError('fetch failed');
      return json(holderBody);
    });
    expect((await getInscriptionOwner(INSCRIPTION))?.source).toBe('b.example');
  });

  it('fails over when host 1 hangs past its budget', async () => {
    __resetOrdClientForTest({ list: 'https://a.example,https://b.example', single: null, throttleMs: 0, backoffMs: 0, hostBudgetMs: 50 });
    serve((url, init) => {
      if (!url.startsWith('https://a.example')) return json(holderBody);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    expect((await getInscriptionOwner(INSCRIPTION))?.source).toBe('b.example');
    expect(getOrdHostHealth()[0].lastError).toBe('timeout');
  });

  it("a 404 is the host's real answer: no failover, host stays healthy", async () => {
    serve(() => new Response('not found', { status: 404 }));
    expect(await getInscriptionOwner(INSCRIPTION)).toBeNull();
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['a.example']);
    expect(getOrdHostHealth()[0]).toMatchObject({ ok: true, lastStatus: 404, coolingDownUntil: null });
  });

  it('every host down → null, one structured log line per failover', async () => {
    serve(() => blockPage());
    expect(await getInscriptionOwner(INSCRIPTION)).toBeNull();

    const lines = warn.mock.calls
      .map((args) => String(args[0]))
      .filter((l) => l.includes('ord_failover'))
      .map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { event: 'ord_failover', host: 'a.example', route: '/r/inscription', reason: 'http_403', attempts: 2, next: 'b.example' },
      { event: 'ord_failover', host: 'b.example', route: '/r/inscription', reason: 'http_403', attempts: 2, next: null },
    ]);
  });
});

describe('host cooldown', () => {
  it('concurrent calls that fail over together log each host once', async () => {
    serve(() => blockPage());
    await Promise.all(Array.from({ length: 4 }, () => ordGet('/r/utxo/x:0', { throttle: false })));
    const lines = warn.mock.calls.map((args) => String(args[0])).filter((l) => l.includes('ord_failover'));
    expect(lines.map((l) => JSON.parse(l).host)).toEqual(['a.example', 'b.example']);
  });

  it('a failed host is skipped for 60 s, then tried again', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    serve((url) => (url.startsWith('https://a.example') ? blockPage() : json(holderBody)));

    await getInscriptionOwner(INSCRIPTION);
    calls = [];
    await getInscriptionOwner(INSCRIPTION);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['b.example']);
    expect(getOrdHostHealth()[0].coolingDownUntil).toBe(new Date(now + HOST_COOLDOWN_MS).toISOString());

    now += HOST_COOLDOWN_MS + 1;
    calls = [];
    await getInscriptionOwner(INSCRIPTION);
    expect(calls[0].url.startsWith('https://a.example')).toBe(true);
  });

  it('with every host cooling down a lookup answers null without a request', async () => {
    serve(() => blockPage());
    await getInscriptionOwner(INSCRIPTION);
    calls = [];
    expect(await getInscriptionOwner(INSCRIPTION)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('request shape', () => {
  it('sends a descriptive User-Agent on every call', async () => {
    serve((url) => (url.startsWith('https://a.example') ? blockPage() : json(holderBody)));
    await getInscriptionOwner(INSCRIPTION);
    expect(calls.length).toBe(3);
    for (const c of calls) {
      expect(c.headers['User-Agent']).toBe(`BlockGenomics/${pkg.version} (+https://blockgenomics.io)`);
    }
  });

  it('sends lifted credentials as a header, never in the URL or a log line', async () => {
    __resetOrdClientForTest({ list: null, single: 'https://user:s3cret@ord.example', throttleMs: 0, backoffMs: 0 });
    serve(() => blockPage());
    await getInscriptionOwner(INSCRIPTION);

    expect(calls[0].url).toBe(`https://ord.example/r/inscription/${INSCRIPTION}`);
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from('user:s3cret').toString('base64')}`);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('s3cret');
    expect(JSON.stringify(getOrdHostHealth())).not.toContain('s3cret');
    expect(getOrdHosts()[0].label).toBe('ord.example');
  });

  it('reads deed content through the host list instead of a hard-coded ordinals.com', async () => {
    serve((url) => (url.startsWith('https://a.example') ? blockPage() : new Response('718840.bitmap', { status: 200 })));
    expect(await getInscriptionContent(INSCRIPTION)).toBe('718840.bitmap');
    expect(calls.at(-1)?.url).toBe(`https://b.example/content/${INSCRIPTION}`);
  });

  it('reads the tip through the host list', async () => {
    serve((url) => (url.startsWith('https://a.example') ? blockPage() : new Response('972672', { status: 200 })));
    expect(await getStatus()).toEqual({ height: 972672 });
  });
});
