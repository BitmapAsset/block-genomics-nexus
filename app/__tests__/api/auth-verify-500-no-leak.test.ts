/**
 * REVIEW-bg89 note 7: "`auth/verify` returns `e.message` in its 500 body …
 * which would expose the Prisma error text. Return a generic message and log
 * the detail."
 *
 * An unexpected failure inside POST (or the GET handle check) answers 500 with
 * a generic message. The raw error text goes to the server log only.
 */

const verifyBip322 = jest.fn(() => true);
const consumeChallengeFromMessage = jest.fn();
const findUserByHandle = jest.fn();
const LEAK = 'Invalid `prisma.block.findUnique()` invocation: The column `Block.secretColumn` does not exist';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: (...a: unknown[]) => findUserByHandle(...a) },
    blockProfile: { findUnique: async () => null },
  },
}));
jest.mock('@/lib/bip322', () => ({ verifyBip322: (...a: unknown[]) => verifyBip322(...(a as [])) }));
jest.mock('@/lib/challenges', () => ({
  consumeChallengeFromMessage: (...a: unknown[]) => consumeChallengeFromMessage(...a),
}));
jest.mock('@/lib/activity', () => ({ logActivity: () => {} }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({ scanWalletForBitmap: jest.fn(), verifyInscriptionOwnership: jest.fn() }));
jest.mock('@/lib/api-rate-limit', () => ({
  AUTH_VERIFY_LIMIT: 20,
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));
jest.mock('next/server', () => {
  class NextResponse {
    headers = new Map<string, string>();
    constructor(
      public body: unknown,
      public status: number,
      headers?: Record<string, string>,
    ) {
      for (const [k, v] of Object.entries(headers ?? {})) this.headers.set(k, v);
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { POST, GET } from '@/app/api/v1/auth/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consumeChallengeFromMessage.mockReset();
  findUserByHandle.mockReset();
});
afterEach(() => errorSpy.mockRestore());

it('POST: an unexpected error answers 500 without the error text, and logs it', async () => {
  consumeChallengeFromMessage.mockRejectedValue(new Error(LEAK));
  const res: any = await POST({
    json: async () => ({
      walletAddress: 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978',
      signature: 'sig',
      message: 'msg',
    }),
  } as any);
  expect(res.status).toBe(500);
  const body = JSON.stringify(res.body);
  expect(body).not.toContain('prisma');
  expect(body).not.toContain('secretColumn');
  expect(errorSpy).toHaveBeenCalled();
  expect(errorSpy.mock.calls.flat().join(' ')).toContain('secretColumn');
});

it('GET: an unexpected error answers 500 without the error text, and logs it', async () => {
  findUserByHandle.mockRejectedValue(new Error(LEAK));
  const res: any = await GET({ nextUrl: { searchParams: new URLSearchParams('handle=nexus_brain') } } as any);
  expect(res.status).toBe(500);
  const body = JSON.stringify(res.body);
  expect(body).not.toContain('prisma');
  expect(body).not.toContain('secretColumn');
  expect(errorSpy.mock.calls.flat().join(' ')).toContain('secretColumn');
});
