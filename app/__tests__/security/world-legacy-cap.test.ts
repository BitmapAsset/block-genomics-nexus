/**
 * Legacy world writes count against the block's cap.
 *
 * The bg-world/1 manifest caps a block at MAX_PLACEMENTS live placements; the
 * legacy `BlockObject` route did not count at all, so one owner could grow a
 * block's object list (and every reader's GET) without bound. `POST
 * /api/v1/world` now counts the block's visible objects first and refuses at
 * the cap with the v1 code, creating nothing; `GET` returns at most the cap,
 * oldest first (production holds no block above it).
 *
 * Mocked seams as in world-write-rate-limit: limiter, DB, signature, indexer.
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  WORLD_WRITE_LIMIT: 60,
}));

const mockCreate = jest.fn();
const mockCount = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: { findUnique: jest.fn(async () => ({ inscriptionId: 'insc_i0' })) },
    blockObject: {
      create: (...a: unknown[]) => mockCreate(...a),
      count: (...a: unknown[]) => mockCount(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
    },
    blockTerrain: { findUnique: jest.fn(async () => null) },
  },
}));

jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({ verifyBlockOwnedBy: async () => ({ verified: true }) }));
jest.mock('@/lib/challenges', () => ({ consumeChallenge: async () => true }));
jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));
jest.mock('@/lib/block-event-emitters', () => ({ emitWorldWrite: async () => undefined, walletProofOf: () => null }));

import { GET, POST } from '@/app/api/v1/world/route';
import { MAX_PLACEMENTS } from '@/lib/world/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const WALLET = 'bc1powner00000000000000000000000000000000000';
const BLOCK = 840000;

const postReq = (body: Record<string, unknown>) => ({ json: async () => body, headers: { get: () => null } }) as never;
const create = () =>
  POST(postReq({ ownerAddress: WALLET, signature: 'sig', message: 'msg', blockHeight: BLOCK, objectType: 'mesh' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'obj_new' });
  mockFindMany.mockResolvedValue([]);
});

describe('POST /api/v1/world at the cap', () => {
  it(`creates nothing at ${MAX_PLACEMENTS} visible objects and answers 409 too_many_placements`, async () => {
    mockCount.mockResolvedValue(MAX_PLACEMENTS);
    const res: any = await create();

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'too_many_placements' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCount).toHaveBeenCalledWith({ where: { blockHeight: BLOCK, visible: true } });
  });

  it('creates the object one below the cap', async () => {
    mockCount.mockResolvedValue(MAX_PLACEMENTS - 1);
    const res: any = await create();

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/world', () => {
  it('returns at most the cap, oldest first', async () => {
    const res: any = await GET({
      nextUrl: new URL(`http://localhost/api/v1/world?blockHeight=${BLOCK}`),
      headers: { get: () => null },
    } as never);

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { blockHeight: BLOCK, visible: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_PLACEMENTS,
    });
  });
});
