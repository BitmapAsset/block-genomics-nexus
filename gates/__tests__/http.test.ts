import { describe, expect, it } from 'vitest';
import { createClient } from '../lib/http.ts';
import { NotRunError } from '../lib/types.ts';
import { SITE, fakeFetch } from './helpers.ts';
import type { Call, Route } from './helpers.ts';

type Opts = { checkId?: string; gateBlock?: number | null; timeoutMs?: number; budget?: { left: number } };

function client(fetchImpl: typeof fetch, opts: Opts = {}) {
  return createClient({
    checkId: opts.checkId ?? 'G-OWNER-ONLY',
    gateBlock: opts.gateBlock === undefined ? 840000 : opts.gateBlock,
    fetchImpl,
    budget: opts.budget ?? { left: 40 },
    cache: new Map(),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
}

function counting(answer: () => Promise<Response>): { fetchImpl: typeof fetch; count: () => number } {
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    return answer();
  }) as typeof fetch;
  return { fetchImpl, count: () => n };
}

describe('the guarded HTTP client', () => {
  it('refuses a write request from any other check, before a request', async () => {
    const calls: Call[] = [];
    const c = client(fakeFetch({}, calls), { checkId: 'G-MAP' });
    await expect(c.refusalProbe('/api/v1/world', { blockHeight: 840000 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('refuses a write request that does not name the gate block', async () => {
    const calls: Call[] = [];
    const c = client(fakeFetch({}, calls));
    await expect(c.refusalProbe('/api/v1/blocks/other/world/place', {})).rejects.toThrow();
    await expect(c.refusalProbe('/api/v1/world', { blockHeight: null })).rejects.toThrow();
    await expect(c.refusalProbe('/api/v1/world', { objectType: 'box' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('refuses a write request without a gate block', async () => {
    const calls: Call[] = [];
    const c = client(fakeFetch({}, calls), { gateBlock: null });
    await expect(c.refusalProbe('/api/v1/world', { blockHeight: 840000 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('refuses any other origin, and a path that would change it', async () => {
    const calls: Call[] = [];
    const c = client(fakeFetch({}, calls));
    await expect(c.get('https://example.org/x')).rejects.toThrow();
    await expect(c.get('//example.org/x')).rejects.toThrow();
    await expect(c.get('http://blockgenomics.io/x')).rejects.toThrow();
    await expect(c.refusalProbe('https://example.org/blocks/840000/x', { blockHeight: 840000 })).rejects.toThrow();
    await expect(c.refusalProbe('https://blockstream.info/api/v1/world', { blockHeight: 840000 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('never follows a redirect', async () => {
    let redirect: string | undefined;
    let n = 0;
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      n += 1;
      redirect = init?.redirect;
      return new Response('', { status: 302, headers: { location: 'https://example.org/' } });
    }) as typeof fetch;
    const a = await client(fetchImpl).get('/x');
    expect(a.status).toBe(302);
    expect(n).toBe(1);
    expect(redirect).toBe('manual');
  });

  it('stops at a budget of 40 requests', async () => {
    const { fetchImpl, count } = counting(async () => new Response('{}', { status: 200 }));
    const c = client(fetchImpl);
    for (let i = 0; i < 40; i += 1) await c.get(`/r/${i}`);
    const err = await c.get('/r/40').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotRunError);
    expect((err as Error).message).toBe('request budget of 40 reached');
    expect(count()).toBe(40);
  });

  it('gives up after a timeout, without a retry', async () => {
    const { fetchImpl, count } = counting(() => new Promise<Response>(() => {}));
    const err = await client(fetchImpl, { timeoutMs: 20 }).get('/slow').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotRunError);
    expect((err as Error).message).toBe('blockgenomics.io did not answer');
    expect(count()).toBe(1);
  });

  it('retries once after a network error', async () => {
    let n = 0;
    const flaky = (async () => {
      n += 1;
      if (n === 1) throw new TypeError('fetch failed');
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const a = await client(flaky).get('/flaky');
    expect(a.status).toBe(200);
    expect(a.json()).toEqual({ ok: true });
    expect(n).toBe(2);

    const { fetchImpl, count } = counting(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await client(fetchImpl).get('/down').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotRunError);
    expect((err as Error).message).toBe('blockgenomics.io did not answer');
    expect(count()).toBe(2);
  });

  it('does not retry after an HTTP status', async () => {
    const { fetchImpl, count } = counting(async () => new Response('', { status: 500 }));
    const a = await client(fetchImpl).get('/broken');
    expect(a.status).toBe(500);
    expect(count()).toBe(1);
  });

  it('stops on a 429', async () => {
    const { fetchImpl } = counting(async () => new Response('', { status: 429 }));
    const err = await client(fetchImpl).get('/busy').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotRunError);
    expect((err as Error).message).toBe('rate limited by blockgenomics.io');
  });

  it('sends no credential of any kind', async () => {
    const calls: Call[] = [];
    const routes: Record<string, Route> = {
      [`GET ${SITE}/a`]: { status: 200, body: {} },
      [`POST ${SITE}/api/v1/world`]: { status: 401, body: {} },
    };
    const c = client(fakeFetch(routes, calls));
    await c.get('/a');
    await c.refusalProbe('/api/v1/world', { blockHeight: 840000, objectType: 'box' });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.authorization).toBeUndefined();
      expect(call.headers.cookie).toBeUndefined();
      expect(call.headers['user-agent']).toBe(
        'bg-promise-checks (+https://github.com/BitmapAsset/block-genomics-nexus)',
      );
    }
    expect(Object.keys(calls[0].headers).sort()).toEqual(['accept', 'user-agent']);
    expect(Object.keys(calls[1].headers).sort()).toEqual(['accept', 'content-type', 'user-agent']);
    expect(c.requests.map((r) => [r.method, r.host, r.path, r.status])).toEqual([
      ['GET', 'blockgenomics.io', '/a', 200],
      ['POST', 'blockgenomics.io', '/api/v1/world', 401],
    ]);
  });

  it('reads one URL once', async () => {
    const { fetchImpl, count } = counting(async () => new Response('{}', { status: 200 }));
    const c = client(fetchImpl);
    await c.get('/same');
    await c.get(`${SITE}/same`);
    expect(count()).toBe(1);
  });
});
