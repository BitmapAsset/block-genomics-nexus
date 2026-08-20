/**
 * `GET /api/v1/blocks/[height]/market`.
 *
 * Two things are being pinned here. The obvious one is the v1 envelope and the
 * param validation every other block route shares. The one that matters more is
 * that this endpoint stays *advisory*: it must answer for heights the app has
 * never seen, it must not 404 an unclaimed block, and it must never grow a field
 * that reads as ownership. The protocol spec (§11.1) makes that a conformance
 * requirement, so it gets a test rather than a comment.
 */

const mockFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { block: { findUnique: (...a: unknown[]) => mockFindUnique(...(a as [])) } },
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

jest.mock('@/lib/sandbox-keys', () => ({
  sandboxGate: async () => ({ response: null, headers: { vary: 'Origin' }, authenticated: false }),
}));

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Record<string, string>;
    constructor(body: unknown, status: number, headers: Record<string, string>) {
      this.body = body;
      this.status = status;
      this.headers = headers;
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers ?? {});
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET } from '@/app/api/v1/blocks/[height]/market/route';
import { clearMarketCache } from '@/lib/marketplace';

/* eslint-disable @typescript-eslint/no-explicit-any */

const req = () => ({ headers: { get: () => null } }) as any;
const call = (height: string) => GET(req(), { params: Promise.resolve({ height }) }) as any;

beforeEach(() => {
  mockFindUnique.mockReset();
  mockFindUnique.mockResolvedValue(null);
  clearMarketCache();
  delete process.env.BG_MAGICEDEN_API_KEY;
});

describe('param validation', () => {
  it.each([
    ['not a number', 'abc'],
    ['negative', '-1'],
    ['empty', ''],
  ])('rejects %s with a 400', async (_label, height) => {
    const res = await call(height);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Invalid block height' });
  });
});

describe('response envelope', () => {
  it('wraps the market view in the standard v1 success envelope', async () => {
    const res = await call('840000');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.height).toBe(840000);
  });

  it('passes sandbox gate headers through', async () => {
    const res = await call('840000');
    expect(res.headers.vary).toBe('Origin');
  });

  it('flags the payload as advisory', async () => {
    // §11.1: the machine-readable promise that this never gates anything.
    const res = await call('840000');
    expect(res.body.data.advisory).toBe(true);
  });

  it('carries no ownership-shaped field', async () => {
    // A regression here would be someone "helpfully" folding the venue's idea
    // of an owner into the payload, which is exactly the confusion §11.1 exists
    // to prevent.
    const keys = Object.keys((await call('840000')).body.data);
    expect(keys).not.toContain('owner');
    expect(keys).not.toContain('ownerAddress');
    expect(keys).not.toContain('onChainOwner');
  });
});

describe('unclaimed and unknown blocks', () => {
  it('answers 200 for a height the app has never recorded', async () => {
    // Deliberately not a 404: every height is a real bitmap district, and the
    // block page renders for all of them.
    mockFindUnique.mockResolvedValue(null);
    const res = await call('999999');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('unconfigured');
  });

  it('reports not_listed for an uninscribed block once a venue is configured', async () => {
    process.env.BG_MAGICEDEN_API_KEY = 'k';
    mockFindUnique.mockResolvedValue({ inscriptionId: null });
    const res = await call('840001');
    expect(res.body.data.status).toBe('not_listed');
    expect(res.body.data.venuesQueried).toEqual([]);
  });

  it('reports unconfigured when no venue has credentials', async () => {
    mockFindUnique.mockResolvedValue({ inscriptionId: 'abci0' });
    const res = await call('840002');
    expect(res.body.data.status).toBe('unconfigured');
    expect(res.body.data.listing).toBeNull();
  });
});

describe('failure handling', () => {
  it('returns a 500 envelope rather than throwing when the database fails', async () => {
    mockFindUnique.mockRejectedValue(new Error('db down'));
    const res = await call('840003');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
