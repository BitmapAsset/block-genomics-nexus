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

  it('keeps separate budgets per host', async () => {
    const { clock } = virtualClock();
    const starts: { url: string; at: number }[] = [];
    const limiter = new Limiter({ fetch: scriptedFetch({}, starts, clock), clock, defaultPolicy: { rps: 1, burst: 1 } });
    await limiter.get('https://ordinals.com/a');
    await limiter.get('https://blockstream.info/a');
    expect(starts.map((s) => s.at)).toEqual([0, 0]);
  });
});
