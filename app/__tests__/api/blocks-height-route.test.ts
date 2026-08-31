/**
 * `GET /api/v1/blocks/[height]` — the route behind the `bg_block` MCP tool.
 *
 * Pins three things that were wrong on the live endpoint:
 *
 *   1. `99999999999` answered 500. The height went straight to Prisma and the
 *      int4 range error surfaced as an internal error.
 *   2. Height 0 must keep working. It is the genesis block, and the falsy-zero
 *      guards fixed elsewhere in this change must never be reintroduced here.
 *   3. `hash` was null for almost every block. Nothing in the write paths ever
 *      set it, so the API reported "no hash" for blocks that plainly have one.
 *      The read now backfills from the chain and keeps the answer.
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockGetBlockHashAtHeight = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: {
      findUnique: (...a: unknown[]) => mockFindUnique(...(a as [])),
      update: (...a: unknown[]) => mockUpdate(...(a as [])),
    },
  },
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

jest.mock('@/lib/sandbox-keys', () => ({
  sandboxGate: async () => ({ response: null, headers: {}, authenticated: false }),
}));

jest.mock('@/lib/onchain/esplora', () => ({
  getBlockHashAtHeight: (...a: unknown[]) => mockGetBlockHashAtHeight(...(a as [])),
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

import { GET } from '@/app/api/v1/blocks/[height]/route';
import { INVALID_BLOCK_HEIGHT_MESSAGE } from '@/lib/block-height';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REAL_HASH = '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5';

const req = () => ({ headers: { get: () => null } }) as any;
const call = (height: string) => GET(req(), { params: Promise.resolve({ height }) }) as any;

const blockRow = (over: Record<string, unknown> = {}) => ({
  height: 840000,
  hash: REAL_HASH,
  ownerAddress: null,
  owner: null,
  _count: { parcels: 0 },
  ...over,
});

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockUpdate.mockReset().mockResolvedValue({});
  mockGetBlockHashAtHeight.mockReset().mockResolvedValue(null);
});

describe('height validation', () => {
  it('rejects an out-of-range height with a 400 and never queries', async () => {
    const res = await call('99999999999');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: INVALID_BLOCK_HEIGHT_MESSAGE });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([['abc'], ['-1'], [''], ['840000junk']])('rejects %s with a 400', async (height) => {
    expect((await call(height)).status).toBe(400);
  });

  it('serves the genesis block', async () => {
    mockFindUnique.mockResolvedValue(blockRow({ height: 0 }));

    const res = await call('0');

    expect(res.status).toBe(200);
    expect(res.body.data.height).toBe(0);
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { height: 0 } }));
  });
});

describe('block hash backfill', () => {
  it('fetches and persists the hash when the row is missing one', async () => {
    mockFindUnique.mockResolvedValue(blockRow({ height: 935550, hash: null }));
    mockGetBlockHashAtHeight.mockResolvedValue(REAL_HASH);

    const res = await call('935550');

    expect(res.status).toBe(200);
    expect(res.body.data.hash).toBe(REAL_HASH);
    expect(mockGetBlockHashAtHeight).toHaveBeenCalledWith(935550);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { height: 935550 }, data: { hash: REAL_HASH } });
  });

  it('leaves the hash empty rather than guessing when no indexer answers', async () => {
    mockFindUnique.mockResolvedValue(blockRow({ height: 935550, hash: null }));
    mockGetBlockHashAtHeight.mockResolvedValue(null);

    const res = await call('935550');

    expect(res.status).toBe(200);
    expect(res.body.data.hash).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('still answers when persisting the backfill fails', async () => {
    mockFindUnique.mockResolvedValue(blockRow({ height: 935550, hash: null }));
    mockGetBlockHashAtHeight.mockResolvedValue(REAL_HASH);
    mockUpdate.mockRejectedValue(new Error('read-only replica'));

    const res = await call('935550');

    expect(res.status).toBe(200);
    expect(res.body.data.hash).toBe(REAL_HASH);
  });

  it('does not call the chain for a block that already has its hash', async () => {
    mockFindUnique.mockResolvedValue(blockRow());

    const res = await call('840000');

    expect(res.body.data.hash).toBe(REAL_HASH);
    expect(mockGetBlockHashAtHeight).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('response shape', () => {
  it('reports the parcel count and drops the raw _count relation', async () => {
    mockFindUnique.mockResolvedValue(blockRow({ _count: { parcels: 3 } }));

    const res = await call('840000');

    expect(res.body.data.parcelCount).toBe(3);
    expect(res.body.data._count).toBeUndefined();
  });

  it('404s an unknown block', async () => {
    expect((await call('123456')).status).toBe(404);
  });
});
