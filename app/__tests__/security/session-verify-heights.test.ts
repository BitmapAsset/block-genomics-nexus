/**
 * Sign-in takes strict, mined heights and starts at most 8 new deed checks per
 * instance.
 *
 * `POST /api/v1/session/verify`:
 * - a height must be a plain decimal integer in range ("840000junk" is a 400,
 *   not block 840,000), and a height above the chain tip is a 400. An
 *   unreadable tip refuses nothing.
 * - a claimed block whose deed this instance has not answered (no cached
 *   answer, no stored verdict) and is not resolving takes one of 8 slots for
 *   its check. With every slot taken, such a block is reported "retry shortly"
 *   at once and no check starts. A block with an answer, or one whose
 *   resolution is already running, is checked as before without a slot.
 * - a slot whose check returned while the deed is still resolving is held until
 *   that resolution lands (at most 45 s), so the cap bounds new checks started
 *   per 45 s rather than checks in flight.
 *
 * The real route; mocked seams as in session-verify-deadline.test.ts, plus the
 * deed module's read-only probes and the tip.
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
  rateLimitDurable: async () => ({ allowed: true, count: 1, retryAfterSec: 0 }),
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

const mockAboveTip = jest.fn(async (h: number) => h > 980_000);
jest.mock('@/lib/block-summary', () => ({
  isAboveTip: (h: number) => mockAboveTip(h),
}));

const mockPeek = jest.fn<Promise<unknown>, [number]>(async () => null);
const mockResolving = jest.fn<boolean, [number]>(() => false);
const mockCanonical = jest.fn<Promise<unknown>, [number, unknown?]>(async () => ({ verdict: 'undetermined' }));
jest.mock('@/lib/onchain/deed', () => ({
  peekCanonicalDeed: (h: number) => mockPeek(h),
  isDeedResolving: (h: number) => mockResolving(h),
  canonicalDeedFor: (h: number, o?: unknown) => mockCanonical(h, o),
}));

import { POST } from '@/app/api/v1/session/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const OWNER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const RETRY_TEXT = 'On-chain ownership could not be confirmed right now — retry shortly.';

function req(blocks: unknown[]): any {
  return {
    json: async () => ({ walletAddress: OWNER, message: 'Block Genomics verification: n', signature: 'sig', blocks }),
    headers: { get: () => null },
  };
}

function resetSlots() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/signin-deed-checks').__resetSigninDeedChecksForTest();
  } catch {
    // Not there before the cap exists.
  }
}

async function ticks(until: () => boolean, n = 100) {
  for (let i = 0; i < n && !until(); i++) await new Promise((r) => setImmediate(r));
}

const checkedHeights = () => mockCheck.mock.calls.map((c) => c[1] as number);

beforeEach(() => {
  resetSlots();
  mockCheck.mockReset().mockImplementation(async () => ({ verified: true, inscriptionId: 'insc_i0' }));
  mockMint.mockClear();
  mockAboveTip.mockClear().mockImplementation(async (h: number) => h > 980_000);
  mockPeek.mockReset().mockResolvedValue(null);
  mockResolving.mockReset().mockReturnValue(false);
  mockCanonical.mockReset().mockResolvedValue({ verdict: 'undetermined' });
});

describe('strict heights', () => {
  it('refuses "840000junk" with 400 and checks nothing', async () => {
    const res: any = await POST(req(['840000junk']));
    expect(res.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('refuses a number past the height ceiling with 400', async () => {
    const res: any = await POST(req([99_999_999_999]));
    expect(res.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('still takes a plain decimal string', async () => {
    const res: any = await POST(req(['840000']));
    expect(res.status).toBe(201);
    expect(checkedHeights()).toEqual([840000]);
  });

  it('refuses a height above the tip with 400', async () => {
    const res: any = await POST(req([840000, 980_001]));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('blocks must be mined block heights');
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('an unreadable tip refuses nothing: the block is checked as before', async () => {
    mockAboveTip.mockResolvedValue(false);
    const res: any = await POST(req([980_001]));
    expect(res.status).toBe(201);
    expect(checkedHeights()).toEqual([980_001]);
  });
});

describe('at most 8 new deed checks per instance', () => {
  /** Two sign-ins holding 8 cold checks open (the route runs 4 per sign-in at once). */
  async function holdEight() {
    const releases: Array<() => void> = [];
    const COLD = Array.from({ length: 8 }, (_, i) => 760_000 + i);
    mockCheck.mockImplementation((_w: string, h: number) =>
      COLD.includes(h)
        ? new Promise((resolve) => releases.push(() => resolve({ verified: true, inscriptionId: 'insc_i0' })))
        : Promise.resolve({ verified: true, inscriptionId: 'insc_i0' }),
    );
    const open = [POST(req(COLD.slice(0, 4))), POST(req(COLD.slice(4)))];
    await ticks(() => mockCheck.mock.calls.length >= 8);
    expect(mockCheck).toHaveBeenCalledTimes(8);
    return {
      async release() {
        releases.forEach((r) => r());
        await Promise.all(open);
      },
    };
  }

  it('a ninth cold height is reported "retry shortly" at once, with no check started', async () => {
    const held = await holdEight();
    const res: any = await POST(req([770_000]));
    expect(checkedHeights()).not.toContain(770_000);
    expect(res.status).toBe(503);
    expect(res.body.rejected).toEqual([{ blockHeight: 770_000, reason: RETRY_TEXT, retryable: true }]);
    expect(mockMint).not.toHaveBeenCalled();
    await held.release();
  });

  it('a height with a stored verdict still verifies while every slot is taken', async () => {
    const held = await holdEight();
    mockPeek.mockImplementation(async (h: number) => (h === 770_001 ? { verdict: 'canonical', inscriptionId: 'insc_i0' } : null));
    const res: any = await POST(req([770_001]));
    expect(res.status).toBe(201);
    expect(checkedHeights()).toContain(770_001);
    await held.release();
  });

  it('a height whose resolution is already running joins it without a slot', async () => {
    const held = await holdEight();
    mockResolving.mockImplementation((h: number) => h === 770_002);
    const res: any = await POST(req([770_002]));
    expect(res.status).toBe(201);
    expect(checkedHeights()).toContain(770_002);
    await held.release();
  });

  it('slots free again once the checks land', async () => {
    const held = await holdEight();
    await held.release();
    const res: any = await POST(req([770_003]));
    expect(res.status).toBe(201);
    expect(checkedHeights()).toContain(770_003);
  });

  it('a check that returned while its deed still resolves keeps its slot until the resolution lands', async () => {
    const COLD = Array.from({ length: 8 }, (_, i) => 780_000 + i);
    const landing: Array<() => void> = [];
    // The check answers within the request, but leaves its deed resolving in the background.
    const resolvingNow = new Set<number>();
    mockCheck.mockImplementation(async (_w: string, h: number) => {
      resolvingNow.add(h);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    });
    mockResolving.mockImplementation((h: number) => resolvingNow.has(h));
    mockCanonical.mockImplementation(
      (h: number) =>
        new Promise((resolve) => {
          landing.push(() => resolve({ height: h, verdict: 'canonical', inscriptionId: 'insc_i0' }));
        }),
    );

    const first: any = await POST(req(COLD));
    expect(first.status).toBe(503);
    expect(mockCanonical).toHaveBeenCalledTimes(8);
    expect(mockCanonical.mock.calls.every((c) => (c[1] as any)?.budgetMs === 45_000)).toBe(true);

    // The sign-in has answered, but the 8 resolutions are still running: no ninth check.
    mockCheck.mockClear();
    const ninth: any = await POST(req([790_000]));
    expect(mockCheck).not.toHaveBeenCalled();
    expect(ninth.body.rejected).toEqual([{ blockHeight: 790_000, reason: RETRY_TEXT, retryable: true }]);

    landing.forEach((land) => land());
    await ticks(() => false, 10);
    mockCheck.mockImplementation(async () => ({ verified: true, inscriptionId: 'insc_i0' }));
    const after: any = await POST(req([790_000]));
    expect(after.status).toBe(201);
    expect(checkedHeights()).toContain(790_000);
  });
});
