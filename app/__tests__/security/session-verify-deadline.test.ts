/**
 * Session sign-in checks claimed blocks four at a time within one deadline.
 *
 * `POST /api/v1/session/verify` used to check each claimed block in turn. With
 * 25 blocks and a slow chain index (each check up to 8 s) the route ran past
 * its 60 s limit and the caller got no answer. Now at most four checks run at
 * once, and every check shares one 40 s deadline: a block not settled by then
 * comes back in `rejected` as retryable, and the blocks that did verify are
 * still in claimed order.
 *
 * The real route; mocked seams: the per-block ownership check (controllable
 * delay), the signature, the nonce, session minting, events and the limiter.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
  NextRequest: class {},
}));

const mockCheck = jest.fn();
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: (...a: unknown[]) => mockCheck(...a),
}));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => true }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => true }));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined }));
jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFrom: () => '127.0.0.1',
}));
jest.mock('@/lib/block-event-emitters', () => ({
  emitDeedVerified: async () => undefined,
  walletProofOf: () => ({ scheme: 'bip322' }),
}));
const mockMint = jest.fn(async (walletAddress: string, verifiedBlocks: number[]) => ({
  token: 'bg_vfy_test',
  session: { tokenPrefix: 'bg_vfy_te', walletAddress, verifiedBlocks, expiresAt: new Date(0) },
}));
jest.mock('@/lib/verified-sessions', () => ({
  mintVerifiedSession: (...a: unknown[]) => mockMint(...(a as [string, number[]])),
  MAX_BLOCKS_PER_SESSION: 25,
  SESSION_CHALLENGE_PURPOSE: 'session',
}));

import { POST } from '@/app/api/v1/session/verify/route';
import { __resetSigninDeedChecksForTest } from '@/lib/signin-deed-checks';

/* eslint-disable @typescript-eslint/no-explicit-any */
const OWNER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const RETRY_TEXT = 'On-chain ownership could not be confirmed right now — retry shortly.';
const BLOCKS = Array.from({ length: 25 }, (_, i) => 700000 + i);

function req(blocks: number[]): any {
  return {
    json: async () => ({ walletAddress: OWNER, message: 'Block Genomics verification: n', signature: 'sig', blocks }),
    headers: { get: () => null },
  };
}

let inFlight = 0;
let maxInFlight = 0;
let started: number[] = [];

/** Each check takes `delayMs(height)` and answers `answer(height)`. */
function checks(delayMs: (h: number) => number, answer: (h: number) => object) {
  mockCheck.mockImplementation((_wallet: string, height: number) => {
    started.push(height);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((resolve) => {
      setTimeout(() => {
        inFlight--;
        resolve(answer(height));
      }, delayMs(height));
    });
  });
}

beforeEach(() => {
  // Checks a case left running past its deadline keep their sign-in slots; start each case with none.
  __resetSigninDeedChecksForTest();
  inFlight = 0;
  maxInFlight = 0;
  started = [];
  mockCheck.mockReset();
  mockMint.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('slow chain index: 25 blocks at 8 s each', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    checks(() => 8_000, () => ({ verified: true, inscriptionId: 'insc_i0' }));
  });

  it('answers by the 40 s deadline with at most four checks in flight', async () => {
    let answered = false;
    let elapsed = -1;
    const t0 = Date.now();
    const pending = POST(req(BLOCKS)).then((r: any) => {
      answered = true;
      elapsed = Date.now() - t0;
      return r;
    });

    for (let t = 0; t < 40_000 && !answered; t += 1_000) await jest.advanceTimersByTimeAsync(1_000);
    for (let i = 0; i < 50 && !answered; i++) await jest.advanceTimersByTimeAsync(0);
    expect(answered).toBe(true);
    expect(elapsed).toBeLessThanOrEqual(40_000);
    expect(maxInFlight).toBe(4);

    const res: any = await pending;
    expect(res.status).toBe(201);
    const { verifiedBlocks, rejected } = res.body.data;
    // Four 8 s checks at a time settle 16 to 20 of the 25 inside 40 s (a check
    // ending exactly at the deadline may land on either side of it).
    const n = verifiedBlocks.length;
    expect(n).toBeGreaterThanOrEqual(16);
    expect(n).toBeLessThanOrEqual(20);
    expect(verifiedBlocks).toEqual(BLOCKS.slice(0, n));
    expect(rejected).toEqual(
      BLOCKS.slice(n).map((blockHeight) => ({ blockHeight, reason: RETRY_TEXT, retryable: true })),
    );
    expect(mockMint).toHaveBeenCalledWith(OWNER, BLOCKS.slice(0, n), expect.anything());
  });

  it('every block unsettled at the deadline: the retryable 503, nothing minted', async () => {
    checks(() => 60_000, () => ({ verified: true, inscriptionId: 'insc_i0' }));
    let answered = false;
    const pending = POST(req(BLOCKS.slice(0, 3))).then((r: any) => {
      answered = true;
      return r;
    });
    await jest.advanceTimersByTimeAsync(40_000);
    for (let i = 0; i < 50 && !answered; i++) await jest.advanceTimersByTimeAsync(0);
    expect(answered).toBe(true);
    const res: any = await pending;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('onchain_unavailable');
    expect(res.body.rejected).toEqual(
      BLOCKS.slice(0, 3).map((blockHeight) => ({ blockHeight, reason: RETRY_TEXT, retryable: true })),
    );
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('fast checks: the same answer as before', () => {
  const answer = (h: number) => {
    if (h % 5 === 0) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    if (h % 3 === 0) return { verified: false, reason: `Block ${h} is held by another wallet` };
    return { verified: true, inscriptionId: `insc_${h}i0` };
  };

  it('verifiedBlocks and rejected in claimed order, with each reason', async () => {
    // Later blocks settle first, so claimed order cannot come from settle order.
    checks((h) => (BLOCKS.length - (h - 700000)) * 3, answer);
    const res: any = await POST(req(BLOCKS));
    expect(res.status).toBe(201);
    const expectedVerified = BLOCKS.filter((h) => h % 5 !== 0 && h % 3 !== 0);
    const expectedRejected = BLOCKS.filter((h) => h % 5 === 0 || h % 3 === 0).map((h) =>
      h % 5 === 0
        ? { blockHeight: h, reason: RETRY_TEXT, retryable: true }
        : { blockHeight: h, reason: `Block ${h} is held by another wallet`, retryable: false },
    );
    expect(res.body.data.verifiedBlocks).toEqual(expectedVerified);
    expect(res.body.data.rejected).toEqual(expectedRejected);
    expect(started.sort()).toEqual(BLOCKS);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('no block owned: the 403 as before', async () => {
    checks(() => 1, (h) => ({ verified: false, reason: `Block ${h} is held by another wallet` }));
    const res: any = await POST(req(BLOCKS.slice(0, 2)));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ownership_not_proven');
  });

  it('no blocks claimed: a read session, no check', async () => {
    const res: any = await POST(req([]));
    expect(res.status).toBe(201);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(res.body.data.verifiedBlocks).toEqual([]);
  });
});
