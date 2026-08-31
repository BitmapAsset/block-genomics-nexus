/**
 * Height 0 is a real block, and every route has to agree about that.
 *
 * Production disagreed with itself: `bg_block(0)` returned the genesis block
 * while `bg_ownership_verify(0)` answered 400 "positive integer required" and
 * `bg_search("0")` returned no blocks at all. The cause in each case was a guard
 * written against falsiness (`!blockHeight`, `h <= 0`, `qNum > 0`) rather than
 * against range, so the one height that is both valid and falsy fell through.
 *
 * These two routes are the ones the MCP surface exposes; the same guard class
 * was fixed across the world, game, terrain and livestream routes in the same
 * change, and `block-height.test.ts` pins the shared validator they now share.
 */

const mockBlockFindMany = jest.fn();
const mockUserFindMany = jest.fn();
const mockGuardianFindMany = jest.fn();
const mockVerifyBlockOwnership = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: { findMany: (...a: unknown[]) => mockBlockFindMany(...(a as [])) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...(a as [])) },
    guardianAgent: { findMany: (...a: unknown[]) => mockGuardianFindMany(...(a as [])) },
  },
}));

jest.mock('@/lib/ownership-sync', () => ({
  verifyBlockOwnership: (...a: unknown[]) => mockVerifyBlockOwnership(...(a as [])),
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

jest.mock('@/lib/sandbox-keys', () => ({
  sandboxGate: async () => ({ response: null, headers: {}, authenticated: false }),
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

import { GET as SEARCH } from '@/app/api/v1/search/route';
import { GET as OWNERSHIP_VERIFY } from '@/app/api/v1/ownership/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */

const req = (query: string) =>
  ({ nextUrl: { searchParams: new URLSearchParams(query) }, headers: { get: () => null } }) as any;

const search = (query: string) => SEARCH(req(query)) as any;
const ownershipVerify = (query: string) => OWNERSHIP_VERIFY(req(query)) as any;

beforeEach(() => {
  mockBlockFindMany.mockReset().mockResolvedValue([]);
  mockUserFindMany.mockReset().mockResolvedValue([]);
  mockGuardianFindMany.mockReset().mockResolvedValue([]);
  mockVerifyBlockOwnership.mockReset().mockResolvedValue({
    blockHeight: 0,
    dbOwnerAddress: null,
    onChainOwnerAddress: null,
    match: true,
    inscriptionId: null,
    action: 'none',
  });
});

describe('GET /api/v1/search', () => {
  it('searches blocks for the query "0"', async () => {
    mockBlockFindMany.mockResolvedValue([{ height: 0, ownerAddress: null, label: 'Genesis' }]);

    const res = await search('q=0');

    expect(res.status).toBe(200);
    expect(mockBlockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { height: { gte: 0, lte: 999 } } }),
    );
    expect(res.body.data.blocks).toEqual([
      { type: 'block', height: 0, ownerAddress: null, label: 'Genesis', url: '/block/0' },
    ]);
  });

  it('does not run a block query for an out-of-range number', async () => {
    const res = await search('q=99999999999');

    expect(res.status).toBe(200);
    expect(res.body.data.blocks).toEqual([]);
    expect(mockBlockFindMany).not.toHaveBeenCalled();
  });

  it('still treats a non-numeric query as a handle search only', async () => {
    await search('q=satoshi');

    expect(mockBlockFindMany).not.toHaveBeenCalled();
    expect(mockUserFindMany).toHaveBeenCalled();
  });
});

describe('GET /api/v1/ownership/verify', () => {
  it('verifies height 0 instead of calling it invalid', async () => {
    const res = await ownershipVerify('blockHeight=0');

    expect(res.status).toBe(200);
    expect(mockVerifyBlockOwnership).toHaveBeenCalledWith(0, 'display');
  });

  it('rejects an out-of-range height with a 400 and never checks ownership', async () => {
    const res = await ownershipVerify('blockHeight=99999999999');

    expect(res.status).toBe(400);
    expect(mockVerifyBlockOwnership).not.toHaveBeenCalled();
  });

  it('still rejects a missing or malformed height', async () => {
    expect((await ownershipVerify('')).status).toBe(400);
    expect((await ownershipVerify('blockHeight=abc')).status).toBe(400);
    expect((await ownershipVerify('blockHeight=-1')).status).toBe(400);
    expect(mockVerifyBlockOwnership).not.toHaveBeenCalled();
  });
});
