import { describe, expect, it } from 'vitest';
import { Limiter, type Clock } from '../src/limiter.js';

/** Virtual clock: sleep advances time instantly, so spacing is exact and tests are fast. */
function virtualClock() {
  let t = 0;
  const clock: Clock = {
    now: () => t,
    sleep: async (ms) => {
      t += Math.max(0, ms);
      await Promise.resolve();
    },
  };
  return { clock, now: () => t };
}

function scriptedFetch(answers: Record<string, { status: number; headers?: Record<string, string> }[]>, starts: { url: string; at: number }[], clock: Clock) {
  const left: Record<string, { status: number; headers?: Record<string, string> }[]> = JSON.parse(JSON.stringify(answers));
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    starts.push({ url, at: clock.now() });
    const next = left[url]?.shift() ?? { status: 200 };
    return new Response('{}', { status: next.status, headers: next.headers });
  }) as typeof fetch;
}

describe('Limiter', () => {
  it('bursts 6 then holds 2 requests per second for ordinals.com', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock, hosts: { 'https://ordinals.com': { rps: 2, burst: 6 } } });
    for (let i = 0; i < 10; i++) await limiter.get(`https://ordinals.com/r/x/${i}`);
    const at = starts.map((s) => s.at);
    expect(at.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    for (let i = 6; i < 10; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(500);
  });

  it('runs /r/block one at a time, starts at least 5 s apart', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock });
    await Promise.all([1, 2, 3].map((h) => limiter.get(`https://ordinals.com/r/block/${h}`, { lane: 'block' })));
    const at = starts.map((s) => s.at);
    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(5000);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(5000);
  });

  it('single-flight: concurrent GETs of one URL make one request and share the body', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock });
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => limiter.get('https://ordinals.com/r/inscription/x')));
    expect(starts).toHaveLength(1);
    expect(a.bytes).toEqual(b.bytes);
    expect(c.status).toBe(200);
  });

  it('honours Retry-After on 429, then succeeds', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const url = 'https://ordinals.com/r/tx/abc';
    const limiter = new Limiter({ fetch: scriptedFetch({ [url]: [{ status: 429, headers: { 'retry-after': '7' } }, { status: 200 }] }, starts, clock), clock });
    const res = await limiter.get(url);
    expect(res.status).toBe(200);
    expect(starts).toHaveLength(2);
    expect(starts[1].at - starts[0].at).toBeGreaterThanOrEqual(7000);
    expect(limiter.stats().retries).toBe(1);
  });

  it('backs off exponentially with jitter on 5xx and gives up after maxRetries', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const url = 'https://ordinals.com/r/blockheight';
    const limiter = new Limiter({
      fetch: scriptedFetch({ [url]: [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }] }, starts, clock),
      clock,
      random: () => 1, // top of the jitter range: delays 1 s, 2 s, 4 s
      maxRetries: 3,
    });
    const res = await limiter.get(url);
    expect(res.status).toBe(503);
    const gaps = starts.slice(1).map((s, i) => s.at - starts[i].at);
    expect(gaps[0]).toBeGreaterThanOrEqual(1000);
    expect(gaps[1]).toBeGreaterThanOrEqual(2000);
    expect(gaps[2]).toBeGreaterThanOrEqual(4000);
  });

  it('does not retry a 404', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const url = 'https://ordinals.com/r/blockhash/99999999';
    const limiter = new Limiter({ fetch: scriptedFetch({ [url]: [{ status: 404 }] }, starts, clock), clock });
    expect((await limiter.get(url)).status).toBe(404);
    expect(starts).toHaveLength(1);
  });

  it('/r/block starts stay 5 s apart even when the bucket was drained by other calls (review #5)', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock, hosts: { 'https://ordinals.com': { rps: 1, burst: 1 } } });
    const all = [limiter.get('https://ordinals.com/r/block/1', { lane: 'block' })];
    for (let i = 0; i < 8; i++) all.push(limiter.get(`https://ordinals.com/r/x/${i}`));
    all.push(limiter.get('https://ordinals.com/r/block/2', { lane: 'block' }));
    all.push(limiter.get('https://ordinals.com/r/block/3', { lane: 'block' }));
    await Promise.all(all);
    const blocks = starts.filter((s) => s.url.includes('/r/block/')).map((s) => s.at);
    expect(blocks).toHaveLength(3);
    expect(blocks[1] - blocks[0]).toBeGreaterThanOrEqual(5000);
    expect(blocks[2] - blocks[1]).toBeGreaterThanOrEqual(5000);
  });

  it('gives up instead of retrying early when Retry-After exceeds the cap (review #6)', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const url = 'https://ordinals.com/r/sat/1/at/0';
    const limiter = new Limiter({
      fetch: scriptedFetch({ [url]: [{ status: 429, headers: { 'retry-after': '600' } }, { status: 200 }] }, starts, clock),
      clock,
      maxRetryAfterMs: 120_000,
    });
    expect((await limiter.get(url)).status).toBe(429);
    expect(starts).toHaveLength(1);
  });

  it('single-flight: one caller aborting does not fail the others; the request stops only when all leave (review #3)', async () => {
    const started: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    let aborted = false;
    const slowFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      started.push(String(input));
      init?.signal?.addEventListener('abort', () => (aborted = true));
      await gate;
      return new Response('{"ok":1}', { status: 200 });
    }) as typeof fetch;
    const limiter = new Limiter({ fetch: slowFetch });
    const a = new AbortController();
    const b = new AbortController();
    const pa = limiter.get('https://ordinals.com/r/inscription/x', { signal: a.signal });
    const pb = limiter.get('https://ordinals.com/r/inscription/x', { signal: b.signal });
    await new Promise((r) => setTimeout(r, 5));
    a.abort(new Error('caller A gave up'));
    await expect(pa).rejects.toThrow('caller A gave up');
    expect(aborted).toBe(false);
    release!();
    expect((await pb).status).toBe(200);
    expect(started).toHaveLength(1);

    // Both leave: the shared request is aborted and a new caller starts fresh.
    let release2: (() => void) | null = null;
    const gate2 = new Promise<void>((r) => (release2 = r));
    let aborted2 = false;
    const fetch2 = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => (aborted2 = true));
      await gate2;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const l2 = new Limiter({ fetch: fetch2 });
    const c = new AbortController();
    const d = new AbortController();
    const pc = l2.get('https://ordinals.com/r/tx/y', { signal: c.signal });
    const pd = l2.get('https://ordinals.com/r/tx/y', { signal: d.signal });
    await new Promise((r) => setTimeout(r, 5));
    c.abort();
    d.abort();
    await expect(pc).rejects.toThrow();
    await expect(pd).rejects.toThrow();
    expect(aborted2).toBe(true);
    release2!();
  });

  it('keeps separate budgets per host', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock, defaultPolicy: { rps: 1, burst: 1 } });
    await limiter.get('https://ordinals.com/a');
    await limiter.get('https://blockstream.info/a');
    expect(starts.map((s) => s.at)).toEqual([0, 0]);
  });
});
