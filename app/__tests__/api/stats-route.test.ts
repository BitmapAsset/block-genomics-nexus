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

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
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
