/**
 * `POST /api/v1/auth/verify` reports what the on-chain holder check did.
 *
 * /verify used to print "BIP-322 signature confirmed on-chain" for any success,
 * including the path where the indexer was never asked (the wallet was already
 * verified for that block). The route now returns `holderCheck` so the page can
 * say which of the three happened:
 *   'live'     an indexer confirmed the holder on this request
 *   'previous' skipped: this wallet was already verified for this block
 *   'none'     no block claimed
 */

const mockFindUser = jest.fn();
const mockUpsertUser = jest.fn();
// The one gate: resolves the block's deed, then checks its live holder.
const mockScan = jest.fn();
const mockFindBlock = jest.fn();
const mockUpsertBlock = jest.fn();

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

beforeEach(() => {
  mockFindUser.mockReset().mockResolvedValue(null);
  mockUpsertUser.mockReset().mockImplementation(async ({ create }: any) => ({ ...create }));
  mockScan.mockReset();
  mockFindBlock.mockReset().mockResolvedValue({ height: 745506, ownerAddress: ADDR });
  mockUpsertBlock.mockReset().mockResolvedValue({});
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
  expect(mockUpsertBlock).toHaveBeenCalledWith(
    expect.objectContaining({ update: expect.objectContaining({ inscriptionId: 'deedi0' }) }),
  );
  expect(JSON.stringify(mockUpsertBlock.mock.calls)).not.toContain('copyi0');
});

it("reports 'previous' and skips the indexer when already verified for this block", async () => {
  mockFindUser.mockResolvedValue({ verified: true, tier: 1, anchorBlock: 745506, genomeHash: 'g' });
  mockUpsertUser.mockImplementation(async () => ({ walletAddress: ADDR, tier: 1, anchorBlock: 745506, genomeHash: 'g' }));
  const res = await call({ blockHeight: 745506 });
  expect(res.body.data.holderCheck).toBe('previous');
  expect(mockScan).not.toHaveBeenCalled();
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
  expect(mockUpsertBlock).not.toHaveBeenCalled();
});

it("a 'previous' answer leaves the block record alone", async () => {
  mockFindUser.mockResolvedValue(seller);
  mockUpsertUser.mockImplementation(async () => ({ walletAddress: ADDR, tier: 1, anchorBlock: 745506, genomeHash: 'g' }));
  const res = await call({ blockHeight: 745506, inscriptionId: 'dupi0' });
  expect(res.body.data.holderCheck).toBe('previous');
  expect(mockUpsertBlock).not.toHaveBeenCalled();
});

it('a live holder check still records the block owner', async () => {
  mockScan.mockResolvedValue({ verified: true });
  await call({ blockHeight: 745506 });
  expect(mockUpsertBlock).toHaveBeenCalledWith(
    expect.objectContaining({ where: { height: 745506 }, update: expect.objectContaining({ ownerAddress: ADDR }) }),
  );
});
