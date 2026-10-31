/**
 * A community flag names a block its sender holds, and flags are rate-limited.
 *
 * `POST /api/v1/brain/flag` used to take a flag from any wallet: keys are free,
 * so enough fresh wallets could hide any content id. The request now carries
 * `voterBlock`, the signature binds it as its block, and the live-ownership gate
 * checks that the signer holds it. A per-IP write bucket, tighter than the read
 * bucket, runs before anything else.
 *
 * Real route + real BIP-322 signatures; mocked seams: DB (in memory), the
 * ownership gate (chainOwner is the live holder), the durable limiter (an
 * in-memory counter).
 */

let chainOwner: Record<number, string> = {};
let gateUnavailable = false;
const limiterCalls: Array<{ key: string; limit: number; windowMs: number }> = [];
const counts = new Map<string, number>();

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

jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async (wallet: string, height: number) => {
    if (gateUnavailable) {
      return { ok: false, status: 503, code: 'onchain_unavailable', reason: 'Retry shortly.' };
    }
    return chainOwner[height] === wallet
      ? { ok: true, status: 200, walletAddress: wallet }
      : { ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' };
  },
  gateDenialResponse: (gate: { status: number; reason?: string; code?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason, code: gate.code }, { status: gate.status });
  },
}));

jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async (key: string, limit: number, windowMs: number) => {
    limiterCalls.push({ key, limit, windowMs });
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { allowed: count <= limit, count, limit, resetAt: Date.now() + windowMs, retryAfterSec: 60 };
  },
  clientIpFrom: (req: { headers: { get(n: string): string | null } }) =>
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
}));

import prisma from '@/lib/prisma';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { issueChallenge } from '@/lib/challenges';
import { PUBLIC_READ_LIMIT } from '@/lib/api-rate-limit';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';
import { POST as FLAG, GET as FLAG_GET } from '@/app/api/v1/brain/flag/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const HOLDER = makeWallet('p2wpkh');
const STRANGER = makeWallet('p2tr');
let ip = 0;

function request(body: Record<string, unknown>, fromIp = `198.51.100.${++ip % 250}`) {
  const url = new URL('http://localhost/api/v1/brain/flag');
  return {
    json: async () => JSON.parse(JSON.stringify(body)),
    url: url.toString(),
    nextUrl: url,
    headers: new Headers({ 'content-type': 'application/json', 'x-forwarded-for': fromIp }),
  } as any;
}

async function signed(wallet: SimWallet, body: Record<string, unknown>, blockHeight: number) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: wallet.address, purpose: 'brain' });
  const message = buildActionMessage({
    action: 'brain.flag', method: 'POST', path: '/api/v1/brain/flag', blockHeight,
    bodyHash: await hashBody(body), nonce, expiresAt: Date.now() + 60_000,
  });
  return { ...body, message, signature: sign(wallet.privKey, wallet.address, message) };
}

const intent = (w: SimWallet, extra: Record<string, unknown> = {}) => ({
  walletAddress: w.address, contentType: 'chat', contentId: 'm1', reason: 'spam', ...extra,
});

const verdict = () => db.__rows('contentVerdict').find((v: any) => v.contentId === 'm1');

beforeEach(() => {
  db.__reset();
  chainOwner = { [BLOCK]: HOLDER.address };
  gateUnavailable = false;
  limiterCalls.length = 0;
  counts.clear();
});

describe('POST /api/v1/brain/flag — the flagger holds a block', () => {
  it('refuses a flag without voterBlock with 400', async () => {
    const res = await FLAG(request(await signed(HOLDER, intent(HOLDER), 0)));
    expect(res.status).toBe(400);
    expect(db.__rows('contentFlag')).toHaveLength(0);
    expect(verdict()).toBeUndefined();
  });

  it.each([['a string', '840000'], ['a fraction', 840000.5], ['negative', -1]])(
    'refuses voterBlock as %s with 400',
    async (_label, voterBlock) => {
      const res = await FLAG(request(await signed(HOLDER, intent(HOLDER, { voterBlock }), 0)));
      expect(res.status).toBe(400);
      expect(db.__rows('contentFlag')).toHaveLength(0);
    },
  );

  it('refuses a signer who does not hold the named block with 403, and the verdict stays unchanged', async () => {
    db.__rows('contentVerdict').push({ contentType: 'chat', contentId: 'm1', status: 'visible', flagCount: 3, hiddenAt: null });
    const res = await FLAG(request(await signed(STRANGER, intent(STRANGER, { voterBlock: BLOCK }), BLOCK)));
    expect(res.status).toBe(403);
    expect(db.__rows('contentFlag')).toHaveLength(0);
    expect(verdict()).toMatchObject({ status: 'visible', flagCount: 3 });
  });

  it('records the holder’s flag', async () => {
    const res = await FLAG(request(await signed(HOLDER, intent(HOLDER, { voterBlock: BLOCK }), BLOCK)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, flagCount: 1, status: 'visible' });
    expect(db.__rows('contentFlag')).toHaveLength(1);
    expect(verdict()).toMatchObject({ flagCount: 1 });
  });

  it('refuses a signature bound to another block than voterBlock with 401', async () => {
    const res = await FLAG(request(await signed(HOLDER, intent(HOLDER, { voterBlock: BLOCK }), 0)));
    expect(res.status).toBe(401);
    expect(db.__rows('contentFlag')).toHaveLength(0);
  });

  it('answers the retryable 503 of every owner write while ownership cannot be confirmed', async () => {
    gateUnavailable = true;
    const res = await FLAG(request(await signed(HOLDER, intent(HOLDER, { voterBlock: BLOCK }), BLOCK)));
    expect(res.status).toBe(503);
    expect(db.__rows('contentFlag')).toHaveLength(0);
  });
});

describe('POST /api/v1/brain/flag — rate limit', () => {
  it('uses a write bucket with a lower ceiling than the read bucket, charged first', async () => {
    await FLAG(request(intent(HOLDER)));
    expect(limiterCalls).toHaveLength(1);
    expect(limiterCalls[0].key).toMatch(/^v1-brain-flag-write:ip:/);
    expect(limiterCalls[0].limit).toBeLessThan(PUBLIC_READ_LIMIT);

    await FLAG_GET({ url: 'http://localhost/api/v1/brain/flag?contentId=m1', headers: new Headers() } as any);
    expect(limiterCalls[1].key).toMatch(/^v1-brain-flag:ip:/);
    expect(limiterCalls[0].limit).toBeLessThan(limiterCalls[1].limit);
  });

  it('answers 429 to one IP past the write ceiling, before reading the body', async () => {
    await FLAG(request(intent(HOLDER), '203.0.113.7'));
    const ceiling = limiterCalls[0].limit;
    for (let i = 1; i < ceiling; i++) await FLAG(request(intent(HOLDER), '203.0.113.7'));

    let bodyRead = false;
    const req = request(await signed(HOLDER, intent(HOLDER, { voterBlock: BLOCK }), BLOCK), '203.0.113.7');
    const json = req.json;
    req.json = async () => {
      bodyRead = true;
      return json();
    };
    const res = await FLAG(req);
    expect(res.status).toBe(429);
    expect(bodyRead).toBe(false);
    expect(db.__rows('contentFlag')).toHaveLength(0);

    // Another IP is unaffected.
    const other = await FLAG(request(await signed(HOLDER, intent(HOLDER, { voterBlock: BLOCK }), BLOCK), '203.0.113.8'));
    expect(other.status).toBe(200);
  });
});
