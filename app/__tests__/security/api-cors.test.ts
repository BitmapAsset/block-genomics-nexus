/**
 * QA 2026-10-22 #25: every API response carried the pinned origin, so
 * third-party browser apps could not read the public API. Public reads now
 * answer `*` without credentials; authenticated and write requests keep the
 * pinned origin. One writer (the middleware), so config files cannot fight it.
 */

import fs from 'fs';
import path from 'path';

jest.mock('next/server', () => {
  class Headers {
    private m = new Map<string, string>();
    constructor(init?: Record<string, string>) {
      for (const [k, v] of Object.entries(init ?? {})) this.m.set(k.toLowerCase(), v);
    }
    get(k: string) {
      return this.m.get(k.toLowerCase()) ?? null;
    }
    set(k: string, v: string) {
      this.m.set(k.toLowerCase(), v);
    }
    has(k: string) {
      return this.m.has(k.toLowerCase());
    }
  }
  class NextResponse {
    headers: Headers;
    constructor(
      public body: unknown,
      public status = 200,
      headers?: Record<string, string>,
    ) {
      this.headers = new Headers(headers);
    }
    static next() {
      return new NextResponse(null, 200);
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers);
    }
    static redirect(url: unknown, status = 307) {
      return new NextResponse(url, status);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { middleware } from '@/middleware';

/* eslint-disable @typescript-eslint/no-explicit-any */
function req(method: string, pathname: string, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    nextUrl: { pathname, clone: () => ({ pathname }) },
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
  } as any;
}
const acao = (r: any) => r.headers.get('Access-Control-Allow-Origin');
const acac = (r: any) => r.headers.get('Access-Control-Allow-Credentials');

describe('API CORS', () => {
  it.each([
    '/api/v1/stats',
    '/api/v1/search',
    '/api/v1/blocks/718840',
    '/api/v1/blocks/718840/summary',
    '/api/v1/blocks/718840/events',
    '/api/v1/blocks/718840/events/01JB7Z8K2Q4X9M3T6V0R5N1C8D/proof',
    '/api/v1/ownership/718840',
    '/api/v1/profiles/by-block/718840',
  ])('public read GET %s → * without credentials', (p) => {
    const r: any = middleware(req('GET', p, { origin: 'https://example.com' }));
    expect(acao(r)).toBe('*');
    expect(acac(r)).toBeNull();
    expect(r.headers.get('Access-Control-Expose-Headers')).toMatch(/X-RateLimit-Remaining/);
  });

  it('answers a public-read preflight with *', () => {
    const r: any = middleware(req('OPTIONS', '/api/v1/stats', { 'access-control-request-method': 'GET' }));
    expect(acao(r)).toBe('*');
    expect(r.headers.get('Vary')).toMatch(/Access-Control-Request-Method/);
  });

  it.each([
    ['POST', '/api/v1/world'],
    ['GET', '/api/v1/sandbox/whoami'],
    ['GET', '/api/v1/agents/abc/events'],
    ['GET', '/api/v1/history'],
    ['POST', '/api/v1/auth/verify'],
    ['GET', '/api/v1/auth/verify'],
  ])('%s %s keeps the pinned origin with credentials', (m, p) => {
    const r: any = middleware(req(m, p, { origin: 'https://example.com' }));
    expect(acao(r)).toBe('https://blockgenomics.io');
    expect(acac(r)).toBe('true');
  });

  it('keeps the pinned origin on a write preflight to a path that has a public GET', () => {
    const r: any = middleware(req('OPTIONS', '/api/v1/world', { 'access-control-request-method': 'POST' }));
    expect(acao(r)).toBe('https://blockgenomics.io');
  });

  it('never reflects the request Origin', () => {
    const r: any = middleware(req('GET', '/api/v1/world/abc', { origin: 'https://evil.example' }));
    expect(acao(r)).not.toBe('https://evil.example');
  });

  it('sends CORS headers on the sandbox write block too', () => {
    const r: any = middleware(req('POST', '/api/v1/world', { authorization: 'Bearer bg_sbx_x' }));
    expect(r.status).toBe(403);
    expect(acao(r)).toBe('https://blockgenomics.io');
  });

  it('has exactly one writer: no CORS origin in next.config.ts or vercel.json', () => {
    const root = path.join(__dirname, '..', '..');
    expect(fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8')).not.toMatch(/Access-Control-Allow-Origin/);
    expect(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it('lists as public only GET handlers that read no credentials', () => {
    // Every public pattern must resolve to a route whose GET reads no caller credential.
    const apiDir = path.join(__dirname, '..', '..', 'src', 'app', 'api', 'v1');
    const routes = ['stats', 'search', 'blocks/[height]', 'blocks/[height]/summary', 'blocks/[height]/market', 'blocks/[height]/parcels', 'blocks/[height]/events', 'blocks/[height]/events/[id]/proof', 'ownership/[height]', 'ownership/verify', 'world', 'world/terrain', 'users/by-wallet/[address]', 'profiles/by-wallet/[address]', 'profiles/by-block/[height]', 'agents/block/[blockHeight]', 'experiences', 'experiences/[id]'];
    for (const r of routes) {
      const src = fs.readFileSync(path.join(apiDir, r, 'route.ts'), 'utf8');
      const start = src.search(/export (async )?function GET\b/);
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = src.slice(start + 10);
      const end = rest.search(/\nexport /);
      const body = end >= 0 ? rest.slice(0, end) : rest;
      expect([r, /authorization|x-bg-session|requireLive|requireSigned|verifiedSession|agentToken|monitorToken|secretMatch|bip322/i.test(body)]).toEqual([r, false]);
    }
  });
});
