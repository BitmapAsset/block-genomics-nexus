// Made-up answers for the promise checks' tests. Nothing here is a recorded answer of the live site.
import { createClient } from '../lib/http.ts';
import type { Ctx } from '../lib/types.ts';

export const SITE = 'https://blockgenomics.io';
export const BS = 'https://blockstream.info';
export const NPM = 'https://registry.npmjs.org';
export const GH = 'https://api.github.com';

export type Call = { method: string; url: string; headers: Record<string, string>; body?: string };
export type Reply = { status: number; body?: unknown; text?: string };
export type Route = Reply | ((body: unknown) => Reply);

// Keys are 'GET <url>' or 'POST <url>'. A route that is missing answers 599, so a test that
// forgot one shows the status in the check's reason.
export function fakeFetch(routes: Record<string, Route>, calls: Call[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ method, url, headers, body });
    const route = routes[`${method} ${url}`];
    if (route === undefined) return new Response('no made-up route', { status: 599 });
    const reply = typeof route === 'function' ? route(body === undefined ? undefined : JSON.parse(body)) : route;
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return new Response(text, { status: reply.status });
  }) as typeof fetch;
}

export function makeCtx(
  checkId: string,
  routes: Record<string, Route>,
  opts: { gateBlock?: number | null; heights?: number[]; repoRoot?: string; calls?: Call[] } = {},
): Ctx {
  const gateBlock = opts.gateBlock === undefined ? 840000 : opts.gateBlock;
  const http = createClient({
    checkId,
    gateBlock,
    fetchImpl: fakeFetch(routes, opts.calls ?? []),
    budget: { left: 40 },
    cache: new Map(),
  });
  return { heights: opts.heights ?? [840000], gateBlock, http, repoRoot: opts.repoRoot ?? '/nonexistent' };
}
