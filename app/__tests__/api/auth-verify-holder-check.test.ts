/**
 * `POST /api/v1/auth/verify` reports what the on-chain holder check did.
 *
 * /verify used to print "BIP-322 signature confirmed on-chain" for any success,
 * including the path where the indexer was never asked (the wallet was already
 * verified for that block). Sign-in now asks the chain on every request that
 * names a block, and the route returns `holderCheck` so the page can say which
 * of the two happened:
 *   'live'     an indexer confirmed the holder on this request
 *   'none'     no block claimed
 *
 * After a live check the block record gets an owner only where none is
 * recorded: flipping another wallet's ownership belongs to
 * processOwnershipTransfer, which releases the seller's data first.
 */

const mockFindUser = jest.fn();
const mockUpsertUser = jest.fn();
// The one gate: resolves the block's deed, then checks its live holder.
const mockScan = jest.fn();
const mockFindBlock = jest.fn();
const mockUpsertBlock = jest.fn();
const mockCreateBlock = jest.fn();
const mockUpdateBlock = jest.fn();
const mockEmit = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...a: unknown[]) => mockFindUser(...(a as [])),
      upsert: (...a: unknown[]) => mockUpsertUser(...(a as [])),
    },
    blockProfile: { findUnique: async () => null, findFirst: async () => ({ id: 'p' }), create: async () => ({}) },
    block: {
      findUnique: (...a: unknown[]) => mockFindBlock(...(a as [])),
      upsert: (...a: unknown[]) => mockUpsertBlock(...(a as [])),
      create: (...a: unknown[]) => mockCreateBlock(...(a as [])),
      update: (...a: unknown[]) => mockUpdateBlock(...(a as [])),
    },
    handleHistory: { create: async () => ({}) },
  },
}));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => true }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => true }));
jest.mock('@/lib/activity', () => ({ logActivity: () => {} }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: (...a: unknown[]) => mockScan(...(a as [])),
}));
jest.mock('@/lib/block-event-emitters', () => ({
  emitDeedVerified: (...a: unknown[]) => mockEmit(...(a as [])),
  walletProofOf: () => ({ scheme: 'bip322' }),
}));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));
jest.mock('next/server', () => {
  class NextResponse {
    constructor(
      public body: unknown,
      public status: number,
    ) {}
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init?.status ?? 200);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { POST } from '@/app/api/v1/auth/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ADDR = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

const call = (body: Record<string, unknown>) =>
  POST({ json: async () => ({ walletAddress: ADDR, signature: 'sig', message: 'msg', ...body }) } as any) as any;

const noBlockWrite = () => {
  expect(mockUpsertBlock).not.toHaveBeenCalled();
  expect(mockCreateBlock).not.toHaveBeenCalled();
  expect(mockUpdateBlock).not.toHaveBeenCalled();
};

beforeEach(() => {
  mockFindUser.mockReset().mockResolvedValue(null);
  mockUpsertUser.mockReset().mockImplementation(async ({ create }: any) => ({ ...create }));
  mockScan.mockReset();
  mockFindBlock.mockReset().mockResolvedValue({ height: 745506, ownerAddress: ADDR });
  mockUpsertBlock.mockReset().mockResolvedValue({});
  mockCreateBlock.mockReset().mockResolvedValue({});
  mockUpdateBlock.mockReset().mockResolvedValue({});
  mockEmit.mockReset().mockResolvedValue(undefined);
});

it("reports 'live' when the deed's live holder is this wallet on this request", async () => {
  mockScan.mockResolvedValue({ verified: true });
  const res = await call({ blockHeight: 745506 });
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual(expect.objectContaining({ tier: 1, holderCheck: 'live' }));
  expect(mockScan).toHaveBeenCalledWith(ADDR, 745506);
});

it('ignores a caller-supplied inscription id: the gate is asked about the block, not the id', async () => {
  mockScan.mockResolvedValue({ verified: true, inscriptionId: 'deedi0' });
  const res = await call({ blockHeight: 745506, inscriptionId: 'copyi0' });
  expect(res.body.data.holderCheck).toBe('live');
  expect(mockScan).toHaveBeenCalledWith(ADDR, 745506);
  // The record names the deed the gate checked, never the id the caller sent.
  expect(mockUpdateBlock).toHaveBeenCalledWith(
    expect.objectContaining({ where: { height: 745506 }, data: expect.objectContaining({ inscriptionId: 'deedi0' }) }),
  );
  expect(JSON.stringify([mockUpdateBlock.mock.calls, mockCreateBlock.mock.calls, mockUpsertBlock.mock.calls])).not.toContain('copyi0');
});

it('a wallet verified earlier is checked live again', async () => {
  mockFindUser.mockResolvedValue({ verified: true, tier: 1, anchorBlock: 745506, genomeHash: 'g' });
  mockUpsertUser.mockImplementation(async () => ({ walletAddress: ADDR, tier: 1, anchorBlock: 745506, genomeHash: 'g' }));
  mockScan.mockResolvedValue({ verified: true });
  const res = await call({ blockHeight: 745506 });
  expect(res.body.data.holderCheck).toBe('live');
  expect(mockScan).toHaveBeenCalledWith(ADDR, 745506);
  noBlockWrite();
  expect(mockEmit).not.toHaveBeenCalled();
});

it("reports 'none' when no block is claimed", async () => {
  const res = await call({});
  expect(res.body.data).toEqual(expect.objectContaining({ tier: 3, holderCheck: 'none' }));
});

it('still refuses (no success body) when the chain says the wallet does not hold the block', async () => {
  mockScan.mockResolvedValue({ verified: false });
  const res = await call({ blockHeight: 840000 });
  expect(res.status).toBe(403);
  expect(mockUpsertUser).not.toHaveBeenCalled();
});

// ─── a cached verification never rewrites the block's owner (bg58) ──────────

const BUYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const seller = { verified: true, tier: 1, anchorBlock: 745506, genomeHash: 'g' };

it("does not skip the chain when our block record already names another wallet", async () => {
  mockFindUser.mockResolvedValue(seller);
  mockFindBlock.mockResolvedValue({ height: 745506, ownerAddress: BUYER });
  mockScan.mockResolvedValue({ verified: false });
  const res = await call({ blockHeight: 745506 });
  expect(mockScan).toHaveBeenCalledWith(ADDR, 745506);
  expect(res.status).toBe(403);
  noBlockWrite();
});

it('a repeat sign-in leaves the block record alone', async () => {
  mockFindUser.mockResolvedValue(seller);
  mockFindBlock.mockResolvedValue({ height: 745506, ownerAddress: ADDR, inscriptionId: 'deedi0' });
  mockUpsertUser.mockImplementation(async () => ({ walletAddress: ADDR, tier: 1, anchorBlock: 745506, genomeHash: 'g' }));
  mockScan.mockResolvedValue({ verified: true, inscriptionId: 'deedi0' });
  const res = await call({ blockHeight: 745506, inscriptionId: 'dupi0' });
  expect(res.body.data.holderCheck).toBe('live');
  expect(mockScan).toHaveBeenCalledWith(ADDR, 745506);
  noBlockWrite();
  expect(mockEmit).not.toHaveBeenCalled();
});

it('a live holder check records the owner of a block with no record', async () => {
  mockFindBlock.mockResolvedValue(null);
  mockScan.mockResolvedValue({ verified: true });
  await call({ blockHeight: 745506 });
  expect(mockCreateBlock).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ height: 745506, ownerAddress: ADDR }) }),
  );
  expect(mockEmit).toHaveBeenCalledTimes(1);
});

it('a live sign-in does not replace another recorded owner', async () => {
  mockFindBlock.mockResolvedValue({ height: 745506, ownerAddress: BUYER });
  mockScan.mockResolvedValue({ verified: true, inscriptionId: 'deedi0' });
  const res = await call({ blockHeight: 745506 });
  expect(res.body.data.holderCheck).toBe('live');
  expect(mockUpsertBlock).not.toHaveBeenCalled();
  expect(mockCreateBlock).not.toHaveBeenCalled();
  expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
  expect(mockUpdateBlock.mock.calls[0][0]).toEqual({ where: { height: 745506 }, data: { inscriptionId: 'deedi0' } });
});

it('a wallet verified earlier gets 503 when the chain cannot be asked', async () => {
  mockFindUser.mockResolvedValue(seller);
  mockScan.mockResolvedValue({ verified: false, unavailable: true });
  const res = await call({ blockHeight: 745506 });
  expect(res.status).toBe(503);
  expect(mockUpsertUser).not.toHaveBeenCalled();
});
