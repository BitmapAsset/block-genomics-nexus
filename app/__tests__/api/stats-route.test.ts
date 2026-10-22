/**
 * `GET /api/v1/stats` (QA scorecard 2026-10-22 row #10). The footer on every
 * page and LiveStats on / fetch it, and it used to read the database on every
 * hit with `no-store`, so a traffic spike became one DB read per page view.
 * It now reads through the same `unstable_cache` reader as the server-rendered
 * footer and lets the CDN hold the answer for 30 s. The response shape is
 * unchanged.
 */

const mockReadPublicStats = jest.fn();
const mockSandboxGate = jest.fn();
const cacheKeys: string[][] = [];

jest.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown, keyParts: string[]) => {
    cacheKeys.push(keyParts);
    return fn;
  },
}));

jest.mock('@/lib/public-stats', () => ({
  readPublicStats: (...a: unknown[]) => mockReadPublicStats(...(a as [])),
}));

jest.mock('@/lib/sandbox-keys', () => ({
  sandboxGate: (...a: unknown[]) => mockSandboxGate(...(a as [])),
}));

const RL = { 'X-RateLimit-Limit': '120', 'X-RateLimit-Remaining': '117', 'X-RateLimit-Reset': '1761130000' };
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: RL }),
}));

jest.mock('next/server', () => {
  class NextResponse {
    constructor(
      public body: unknown,
      public status: number,
      public headers: Record<string, string>,
    ) {}
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers ?? {});
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET } from '@/app/api/v1/stats/route';
import nextConfig from '../../next.config';

/* eslint-disable @typescript-eslint/no-explicit-any */
const anonymous = { headers: { get: () => null } } as any;
const STATS = { verifiedAgents: 9, genomesMinted: 8, blocksVerified: 17 };
const PUBLIC_CACHE = 'public, s-maxage=30, stale-while-revalidate=120';

describe('GET /api/v1/stats', () => {
  beforeEach(() => {
    mockReadPublicStats.mockReset();
    mockSandboxGate.mockReset();
    mockSandboxGate.mockResolvedValue({ response: null, headers: { Vary: 'Authorization, X-API-Key' }, authenticated: false });
  });

  it('reads through the footer\'s cached reader, not a fresh query of its own', () => {
    expect(cacheKeys).toContainEqual(['footer-public-stats']);
  });

  it('returns the same three counters with a 30 s shared-cache header', async () => {
    mockReadPublicStats.mockResolvedValue(STATS);
    const res: any = await GET(anonymous);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(STATS);
    expect(res.headers['Cache-Control']).toBe(PUBLIC_CACHE);
    expect(res.headers.Vary).toBe('Authorization, X-API-Key');
  });

  it('keeps a sandbox-key response private', async () => {
    mockReadPublicStats.mockResolvedValue(STATS);
    mockSandboxGate.mockResolvedValue({
      response: null,
      headers: { Vary: 'Authorization, X-API-Key', 'Cache-Control': 'private, no-store, max-age=0' },
      authenticated: true,
    });
    const res: any = await GET(anonymous);
    expect(res.body).toEqual(STATS);
    expect(res.headers['Cache-Control']).toBe('private, no-store, max-age=0');
  });

  it('does not let a shared cache keep the zero fallback when the read fails', async () => {
    mockReadPublicStats.mockRejectedValue(new Error('db down'));
    const res: any = await GET(anonymous);
    expect(res.body).toEqual({ verifiedAgents: 0, genomesMinted: 0, blocksVerified: 0 });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

// QA 2026-10-22 #25: the rate-limit headers were exposed by CORS but never
// sent here. The public answer is held by the CDN for 30 s, so it carries only
// the policy (the limit, the same for every caller); a per-caller count would
// be replayed to everyone. Private answers carry the caller's own counts.
describe('GET /api/v1/stats rate-limit headers', () => {
  beforeEach(() => {
    mockReadPublicStats.mockReset().mockResolvedValue(STATS);
    mockSandboxGate.mockReset();
  });

  it('sends the limit, and no per-caller count, on the cached public answer', async () => {
    mockSandboxGate.mockResolvedValue({ response: null, headers: { Vary: 'Authorization, X-API-Key' }, authenticated: false });
    const res: any = await GET(anonymous);
    expect(res.headers['Cache-Control']).toBe(PUBLIC_CACHE);
    expect(res.headers['X-RateLimit-Limit']).toBe('120');
    expect(res.headers['X-RateLimit-Remaining']).toBeUndefined();
    expect(res.headers['X-RateLimit-Reset']).toBeUndefined();
  });

  it('sends the full per-caller counts on an uncached answer', async () => {
    mockSandboxGate.mockResolvedValue({ response: null, headers: { Vary: 'Authorization, X-API-Key' }, authenticated: false });
    mockReadPublicStats.mockRejectedValue(new Error('db down'));
    const res: any = await GET(anonymous);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-RateLimit-Remaining']).toBe('117');
  });

  it('lets a sandbox key keep its own quota headers on its private answer', async () => {
    mockSandboxGate.mockResolvedValue({
      response: null,
      headers: { Vary: 'Authorization, X-API-Key', 'Cache-Control': 'private, no-store, max-age=0', 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '999' },
      authenticated: true,
    });
    const res: any = await GET(anonymous);
    expect(res.headers['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(res.headers['X-RateLimit-Limit']).toBe('1000');
    expect(res.headers['X-RateLimit-Remaining']).toBe('999');
  });
});

describe('next.config.ts headers for /api/v1/stats', () => {
  it('sets no Cache-Control there, so the route header stands', async () => {
    const entries = await nextConfig.headers!();
    for (const entry of entries) {
      const pattern = new RegExp('^' + entry.source.replace(/:path\*/g, '.*') + '$');
      if (!pattern.test('/api/v1/stats')) continue;
      expect(entry.headers.map((h) => h.key.toLowerCase())).not.toContain('cache-control');
    }
  });
});
