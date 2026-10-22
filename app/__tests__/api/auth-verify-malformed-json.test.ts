/**
 * QA 2026-10-22 #15: `POST /api/v1/auth/verify` with a body that is not JSON
 * fell through to the generic catch and answered 500. A bad body is the
 * caller's mistake: 400 with a machine-readable code, never a 500.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => false }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => false }));
jest.mock('@/lib/activity', () => ({ logActivity: () => {} }));
jest.mock('@/lib/onchain/bitmap-ownership', () => ({ scanWalletForBitmap: jest.fn(), verifyInscriptionOwnership: jest.fn() }));
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));
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
const withBody = (json: () => Promise<unknown>) => POST({ json } as any) as any;

it('answers 400 invalid_json when the body does not parse', async () => {
  const res = await withBody(async () => {
    throw new SyntaxError('Unexpected token n in JSON at position 1');
  });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ success: false, error: 'invalid_json' });
});

it.each([null, 'a string', 42, [1, 2]])('answers 400 (not 500) for a JSON body that is not an object: %p', async (v) => {
  const res = await withBody(async () => v);
  expect(res.status).toBe(400);
});

it('still answers 401 for a well-formed body with a bad signature', async () => {
  const res = await withBody(async () => ({
    walletAddress: 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978',
    signature: 'sig',
    message: 'msg',
  }));
  expect(res.status).toBe(401);
});
