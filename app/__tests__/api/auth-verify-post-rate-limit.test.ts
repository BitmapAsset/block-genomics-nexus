/**
 * REVIEW-bg87 item 1: "`POST /api/v1/auth/verify` has no `enforceRateLimit`.
 * Only GET uses the `v1-auth-verify` bucket. POST runs BIP-322 verification
 * plus a DB nonce consume on every request."
 *
 * POST now charges its own durable bucket before it reads the body, answers the
 * shared 429 (JSON + Retry-After) when the bucket is spent, and advertises the
 * X-RateLimit-* headers on every answer it gives, like the other limited routes.
 */

const enforceRateLimit = jest.fn();
const verifyBip322 = jest.fn(() => false);

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/bip322', () => ({ verifyBip322: (...a: unknown[]) => verifyBip322(...(a as [])) }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => false }));
jest.mock('@/lib/activity', () => ({ logActivity: () => {} }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({ scanWalletForBitmap: jest.fn(), verifyInscriptionOwnership: jest.fn() }));
jest.mock('@/lib/api-rate-limit', () => ({
  AUTH_VERIFY_LIMIT: 20,
  enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a),
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

import { POST } from '@/app/api/v1/auth/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const RL_HEADERS = { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '19', 'X-RateLimit-Reset': '1800000000' };

beforeEach(() => {
  enforceRateLimit.mockReset();
  verifyBip322.mockClear();
});

it('charges the v1-auth-verify-post bucket at the auth limit', async () => {
  enforceRateLimit.mockResolvedValue({ response: null, headers: RL_HEADERS });
  const req = { json: async () => null } as any;
  await POST(req);
  expect(enforceRateLimit).toHaveBeenCalledTimes(1);
  expect(enforceRateLimit).toHaveBeenCalledWith(req, { bucket: 'v1-auth-verify-post', limit: 20 });
});

it('answers the limiter 429 before reading the body or verifying a signature', async () => {
  const limited = { status: 429, body: { success: false, code: 'rate_limited' }, headers: new Map([['Retry-After', '42']]) };
  enforceRateLimit.mockResolvedValue({ response: limited, headers: RL_HEADERS });
  const json = jest.fn(async () => ({ walletAddress: 'x', signature: 'y', message: 'z' }));
  const res: any = await POST({ json } as any);
  expect(res).toBe(limited);
  expect(res.status).toBe(429);
  expect(res.headers.get('Retry-After')).toBe('42');
  expect(json).not.toHaveBeenCalled();
  expect(verifyBip322).not.toHaveBeenCalled();
});

it.each([
  ['a body that does not parse', async () => { throw new SyntaxError('bad'); }, 400],
  ['a body without fields', async () => ({}), 400],
  ['a bad signature', async () => ({
    walletAddress: 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978',
    signature: 'sig',
    message: 'msg',
  }), 401],
])('advertises X-RateLimit-* on %s', async (_label, json, status) => {
  enforceRateLimit.mockResolvedValue({ response: null, headers: RL_HEADERS });
  const res: any = await POST({ json } as any);
  expect(res.status).toBe(status);
  expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
  expect(res.headers.get('X-RateLimit-Remaining')).toBe('19');
});

it('keeps GET on its own bucket', async () => {
  const { GET } = await import('@/app/api/v1/auth/verify/route');
  enforceRateLimit.mockResolvedValue({ response: { status: 429 }, headers: {} });
  await GET({ nextUrl: { searchParams: new URLSearchParams() } } as any);
  expect(enforceRateLimit).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-auth-verify' });
});
