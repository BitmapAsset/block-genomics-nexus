/**
 * A challenge says what it authorizes: POST /api/v1/challenge only issues
 * nonces for purposes a route consumes, and the text the wallet signs names the
 * site, the purpose, the address, the nonce and the expiry, one fact per line.
 * A nonce found in that text still verifies by value.
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFrom: () => '127.0.0.1',
  cleanupRateLimits: async () => undefined,
}));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined }));

import prisma from '@/lib/prisma';
import { POST as CHALLENGE } from '@/app/api/v1/challenge/route';
import { CHALLENGE_PURPOSES, consumeChallengeFromMessage } from '@/lib/challenges';
import { makeWallet } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const wallet = makeWallet('p2wpkh');

const req = (body: unknown) => ({ json: async () => body, headers: new Headers() }) as any;

beforeEach(() => db.__reset());

describe('POST /api/v1/challenge', () => {
  it('refuses an unknown purpose with 400 and issues nothing', async () => {
    const res: any = await CHALLENGE(req({ walletAddress: wallet.address, purpose: 'anything-at-all' }));
    expect(res.status).toBe(400);
    expect(db.__rows('challenge')).toHaveLength(0);
  });

  it('lists every purpose a route consumes', () => {
    for (const p of [
      'auth', 'session', 'world', 'profile', 'activity', 'encryption', 'brain', 'parcel-customize',
      'agent-register', 'agent-manage', 'agent-token', 'experience-register', 'experience-manage',
      'guardian-heartbeat', 'guardian', 'vps',
    ]) {
      expect(Object.keys(CHALLENGE_PURPOSES)).toContain(p);
    }
  });

  it.each(['auth', 'agent-token', 'guardian', 'vps'])('the %s text names site, purpose, address, nonce and expiry', async (purpose) => {
    const res: any = await CHALLENGE(req({ walletAddress: wallet.address, purpose }));
    expect(res.status).toBe(200);
    const { message, nonce } = (await res.json()).data;
    const lines = message.split('\n');
    expect(lines[0]).toBe(`blockgenomics.io: ${CHALLENGE_PURPOSES[purpose as keyof typeof CHALLENGE_PURPOSES]}`);
    expect(lines).toContain(`Address: ${wallet.address}`);
    expect(lines).toContain(`Nonce: ${nonce}`);
    expect(lines.some((l: string) => /^Expires: \d{4}-\d\d-\d\dT/.test(l))).toBe(true);
    expect(/^[\x20-\x7e\n]*$/.test(message)).toBe(true); // plain ASCII
    expect(db.__rows('challenge')[0]).toMatchObject({ challenge: nonce, address: wallet.address, purpose });
  });

  it('agent-token and auth texts differ, so the wallet prompt says which one it is', async () => {
    const a: any = await (await CHALLENGE(req({ walletAddress: wallet.address, purpose: 'auth' }))).json();
    const b: any = await (await CHALLENGE(req({ walletAddress: wallet.address, purpose: 'agent-token' }))).json();
    expect(a.data.message.split('\n')[0]).not.toBe(b.data.message.split('\n')[0]);
  });

  it('defaults to auth when no purpose is given', async () => {
    const res: any = await CHALLENGE(req({ walletAddress: wallet.address }));
    expect(res.status).toBe(200);
    expect(db.__rows('challenge')[0].purpose).toBe('auth');
  });

  it('the nonce in the new text is still found and consumed once, for its purpose only', async () => {
    const res: any = await CHALLENGE(req({ walletAddress: wallet.address, purpose: 'session' }));
    const { message } = (await res.json()).data;
    expect(await consumeChallengeFromMessage(wallet.address, message, { purpose: 'auth' })).toBe(false);
    expect(await consumeChallengeFromMessage(wallet.address, message, { purpose: 'session' })).toBe(true);
    expect(await consumeChallengeFromMessage(wallet.address, message, { purpose: 'session' })).toBe(false);
  });
});
