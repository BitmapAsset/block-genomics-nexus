/**
 * §10 — the world WRITE routes are rate limited.
 *
 * `GET /api/v1/world` has carried a limit since the limiter landed; the write
 * side did not, which is the gap #118 left open. It matters more than a read
 * limit: every write now costs a live indexer call BEFORE it costs a database
 * write, so an unlimited caller could point our ownership gate at ordinals.com
 * as an amplifier, and each rejected attempt would still spend the round trip.
 *
 * What is asserted here is the wiring, not the counting — the fixed-window
 * arithmetic has its own suite in `rate-limit-db-sim.test.ts`. Specifically:
 * every write route charges a bucket, and a 429 short-circuits BEFORE any
 * signature check, indexer call, or database write happens.
 */

const enforceRateLimit = jest.fn(async () => ({ response: null as unknown, headers: { 'X-RateLimit-Limit': '60' } }));

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
  enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...(a as [])),
  WORLD_WRITE_LIMIT: 60,
  WORLD_BATCH_LIMIT: 20,
}));

const mockObjectCreate = jest.fn();
const mockObjectFindUnique = jest.fn();
const mockObjectUpdate = jest.fn();
const mockTerrainUpsert = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: { findUnique: jest.fn(async () => ({ inscriptionId: 'insc_i0' })) },
    blockObject: {
      create: (...a: unknown[]) => mockObjectCreate(...a),
      findUnique: (...a: unknown[]) => mockObjectFindUnique(...a),
      update: (...a: unknown[]) => mockObjectUpdate(...a),
      findMany: jest.fn(async () => []),
      delete: jest.fn(),
    },
    blockTerrain: { upsert: (...a: unknown[]) => mockTerrainUpsert(...a) },
  },
}));

const verifyWalletSignature = jest.fn(() => true);
jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: (...a: unknown[]) => verifyWalletSignature(...(a as [])) }));

const verifyBlockOwnedBy = jest.fn(async () => ({ verified: true }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: (...a: unknown[]) => verifyBlockOwnedBy(...(a as [])),
}));

jest.mock('@/lib/challenges', () => ({ consumeChallenge: async () => true }));
jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));

import { POST as CREATE } from '@/app/api/v1/world/route';
import { PATCH, DELETE } from '@/app/api/v1/world/[id]/route';
import { POST as BATCH } from '@/app/api/v1/world/batch/route';
import { POST as TERRAIN } from '@/app/api/v1/world/terrain/route';

const WALLET = 'bc1powner00000000000000000000000000000000000';
const BLOCK = 840000;

const req = (body: Record<string, unknown>) =>
  ({ json: async () => body, headers: { get: () => null } }) as never;

const signed = (extra: Record<string, unknown> = {}) => ({
  ownerAddress: WALLET,
  signature: 'sig',
  message: 'msg',
  ...extra,
});

/** Make the next limiter call answer "over quota". */
function overQuota() {
  const { NextResponse } = jest.requireMock('next/server') as {
    NextResponse: { json: (b: unknown, i?: { status?: number }) => unknown };
  };
  enforceRateLimit.mockResolvedValueOnce({
    response: NextResponse.json({ success: false, code: 'rate_limited' }, { status: 429 }),
    headers: {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  enforceRateLimit.mockResolvedValue({ response: null, headers: { 'X-RateLimit-Limit': '60' } });
  mockObjectFindUnique.mockResolvedValue({ id: 'obj_1', blockHeight: BLOCK, ownerAddress: WALLET, locked: false });
  mockObjectCreate.mockResolvedValue({ id: 'obj_new' });
  mockObjectUpdate.mockResolvedValue({ id: 'obj_1' });
  mockTerrainUpsert.mockResolvedValue({ blockHeight: BLOCK });
});

describe('§10: every world write route charges a rate-limit bucket', () => {
  it('POST /api/v1/world — the route #118 left unprotected', async () => {
    await CREATE(req(signed({ blockHeight: BLOCK, objectType: 'mesh' })));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-world-write', limit: 60 });
  });

  it('PATCH /api/v1/world/[id]', async () => {
    await PATCH(req(signed({ color: '#00ff00' })), { params: Promise.resolve({ id: 'obj_1' }) });

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-world-write', limit: 60 });
  });

  it('DELETE /api/v1/world/[id]', async () => {
    await DELETE(req(signed()), { params: Promise.resolve({ id: 'obj_1' }) });

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-world-write', limit: 60 });
  });

  it('POST /api/v1/world/terrain', async () => {
    await TERRAIN(req(signed({ blockHeight: BLOCK, groundColor: '#123456' })));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-world-write', limit: 60 });
  });

  it('POST /api/v1/world/batch gets its own, tighter bucket — one call, up to 100 writes', async () => {
    await BATCH(req(signed({ blockHeight: BLOCK, operations: [{ action: 'create', data: { objectType: 'mesh' } }] })));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-world-batch', limit: 20 });
  });
});

describe('§10: a limited request is refused before it costs anything', () => {
  it('returns 429 from POST /api/v1/world without a signature check, indexer call, or write', async () => {
    overQuota();

    const res: any = await CREATE(req(signed({ blockHeight: BLOCK, objectType: 'mesh' })));

    expect(res.status).toBe(429);
    expect(verifyWalletSignature).not.toHaveBeenCalled();
    expect(verifyBlockOwnedBy).not.toHaveBeenCalled();
    expect(mockObjectCreate).not.toHaveBeenCalled();
  });

  it('returns 429 from PATCH before reading or writing the object', async () => {
    overQuota();

    const res: any = await PATCH(req(signed({ color: '#00ff00' })), { params: Promise.resolve({ id: 'obj_1' }) });

    expect(res.status).toBe(429);
    expect(mockObjectFindUnique).not.toHaveBeenCalled();
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('returns 429 from the batch route before any sub-op runs', async () => {
    overQuota();

    const res: any = await BATCH(
      req(signed({ blockHeight: BLOCK, operations: [{ action: 'create', data: { objectType: 'mesh' } }] }))
    );

    expect(res.status).toBe(429);
    expect(mockObjectCreate).not.toHaveBeenCalled();
  });
});

describe('§10: successful writes advertise the caller\'s remaining quota', () => {
  it('merges limiter headers into the 201 from POST /api/v1/world', async () => {
    const res: any = await CREATE(req(signed({ blockHeight: BLOCK, objectType: 'mesh' })));

    expect(res.status).toBe(201);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
  });
});
