/**
 * SIMULATION — routes with real side effects stop trusting a wallet string in
 * the body (bg47 E2E-07).
 *
 *   POST /lightning/invoice — each valid body created a ZBD charge, no auth, no limit.
 *   DELETE /livestream      — compared body.walletAddress to streamOwner: anyone ended any stream.
 *   POST /brain/appeal      — appeals and votes were keyed on a caller-supplied wallet.
 *   POST /activity          — wrote activity rows for any wallet string.
 *
 * Signed actions use the codebase's hardened shape: BIP-322 over the canonical
 * action message, bound to the exact body, with a one-time server nonce.
 */

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

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

const mockRateLimit = jest.fn(async () => ({ response: null as unknown, headers: {} }));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => mockRateLimit(...(args as [])),
  PUBLIC_READ_LIMIT: 120,
}));

const mockCreateInvoice = jest.fn(async () => ({ bolt11: 'lnbc1...', invoiceId: 'inv_1' }));
jest.mock('@/lib/lightning', () => ({ createLightningInvoice: (...args: unknown[]) => mockCreateInvoice(...(args as [])) }));

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as INVOICE } from '@/app/api/v1/lightning/invoice/route';
import { DELETE as END_STREAM } from '@/app/api/v1/livestream/route';
import { POST as APPEAL } from '@/app/api/v1/brain/appeal/route';
import { POST as ACTIVITY } from '@/app/api/v1/activity/route';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const OWNER = makeWallet('p2tr');
const STRANGER = makeWallet('p2tr');
const BLOCK = 840000;

type Wallet = { privKey: string; address: string };

/** Body + canonical action-bound signature, as lib/world-signing.ts builds it. */
async function signedBody(
  wallet: Wallet,
  binding: { action: string; method: string; path: string; blockHeight: number; purpose: string },
  intent: Record<string, unknown>
) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: wallet.address, purpose: binding.purpose });
  const message = buildActionMessage({
    action: binding.action,
    method: binding.method,
    path: binding.path,
    blockHeight: binding.blockHeight,
    bodyHash: await hashBody(intent),
    nonce,
    expiresAt: Date.now() + 5 * 60_000,
  });
  return { ...intent, message, signature: sign(wallet.privKey, wallet.address, message) };
}

const jsonReq = (body: Record<string, unknown>, token?: string) =>
  ({
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
  }) as never;

beforeEach(() => {
  db.__reset();
  mockRateLimit.mockClear();
  mockCreateInvoice.mockClear();
});

// ── POST /lightning/invoice ─────────────────────────────────────────────
describe('POST /lightning/invoice', () => {
  const invoiceBody = { amountUsd: '5.00', description: 'test', correlationId: 'c-1' };

  it('refuses a caller without a verified session (401) and creates no charge', async () => {
    const res: any = await INVOICE(jsonReq(invoiceBody));
    expect(res.status).toBe(401);
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('creates the invoice for a verified session, behind its own rate-limit bucket', async () => {
    const { token } = await mintVerifiedSession(OWNER.address, []);
    const res: any = await INVOICE(jsonReq(invoiceBody, token));

    expect(res.status).toBe(200);
    expect(mockCreateInvoice).toHaveBeenCalledTimes(1);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bucket: 'v1-lightning-invoice' }));
  });

  it('a rate-limited caller is stopped before any charge', async () => {
    mockRateLimit.mockResolvedValueOnce({ response: { status: 429 }, headers: {} });
    const { token } = await mintVerifiedSession(OWNER.address, []);
    const res: any = await INVOICE(jsonReq(invoiceBody, token));

    expect(res.status).toBe(429);
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });
});

// ── DELETE /livestream ──────────────────────────────────────────────────
describe('DELETE /livestream', () => {
  const END = { action: 'livestream.end', method: 'DELETE', path: '/api/v1/livestream', blockHeight: BLOCK, purpose: 'world' };
  const streamOwner = async () => (await db.block.findUnique({ where: { height: BLOCK } })).streamOwner;

  beforeEach(async () => {
    await db.block.create({
      data: { height: BLOCK, streamUrl: 'https://youtu.be/abc', streamType: 'broadcast', streamOwner: OWNER.address, streamStartedAt: new Date() },
    });
  });

  it("can no longer be ended by naming the owner's wallet in the body (401)", async () => {
    const res: any = await END_STREAM(jsonReq({ blockHeight: BLOCK, walletAddress: OWNER.address }));
    expect(res.status).toBe(401);
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it('a signed request from someone other than the stream owner is refused (403)', async () => {
    const res: any = await END_STREAM(jsonReq(await signedBody(STRANGER, END, { blockHeight: BLOCK, ownerAddress: STRANGER.address })));
    expect(res.status).toBe(403);
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it('the stream owner ends it with a signed request; a replay is refused', async () => {
    const body = await signedBody(OWNER, END, { blockHeight: BLOCK, ownerAddress: OWNER.address });

    const res: any = await END_STREAM(jsonReq(body));
    expect(res.status).toBe(200);
    expect(await streamOwner()).toBeNull();

    await db.block.update({ where: { height: BLOCK }, data: { streamOwner: OWNER.address, streamUrl: 'https://youtu.be/abc' } });
    const replay: any = await END_STREAM(jsonReq(body));
    expect(replay.status).toBe(401);
    expect(await streamOwner()).toBe(OWNER.address);
  });
});

// ── POST /brain/appeal ──────────────────────────────────────────────────
describe('POST /brain/appeal', () => {
  const APPEAL_B = { action: 'brain.appeal', method: 'POST', path: '/api/v1/brain/appeal', blockHeight: 0, purpose: 'brain' };
  const VOTE_B = { ...APPEAL_B, action: 'brain.vote' };

  beforeEach(async () => {
    await db.contentVerdict.create({ data: { contentId: 'msg_1', status: 'hidden' } });
  });

  it('an unsigned appeal under any wallet string is refused (401) and files nothing', async () => {
    const res: any = await APPEAL(jsonReq({ action: 'appeal', contentId: 'msg_1', walletAddress: STRANGER.address }));
    expect(res.status).toBe(401);
    expect(db.__rows('appeal')).toHaveLength(0);
  });

  it('a signed appeal is filed under the signing wallet', async () => {
    const res: any = await APPEAL(jsonReq(await signedBody(OWNER, APPEAL_B, { action: 'appeal', contentId: 'msg_1', walletAddress: OWNER.address })));
    expect(res.status).toBe(200);
    expect(db.__rows('appeal')).toEqual([expect.objectContaining({ contentId: 'msg_1', appealedBy: OWNER.address })]);
  });

  it('one appeal per wallet per content: the same wallet cannot re-file after resolution (409)', async () => {
    await APPEAL(jsonReq(await signedBody(OWNER, APPEAL_B, { action: 'appeal', contentId: 'msg_1', walletAddress: OWNER.address })));
    db.__rows('appeal')[0].status = 'upheld';

    const again: any = await APPEAL(jsonReq(await signedBody(OWNER, APPEAL_B, { action: 'appeal', contentId: 'msg_1', walletAddress: OWNER.address })));
    expect(again.status).toBe(409);

    const other: any = await APPEAL(jsonReq(await signedBody(STRANGER, APPEAL_B, { action: 'appeal', contentId: 'msg_1', walletAddress: STRANGER.address })));
    expect(other.status).toBe(200);
  });

  it('votes need a signature too, and count once per wallet', async () => {
    await APPEAL(jsonReq(await signedBody(OWNER, APPEAL_B, { action: 'appeal', contentId: 'msg_1', walletAddress: OWNER.address })));
    // The in-memory store does not apply schema defaults; these are Appeal's.
    Object.assign(db.__rows('appeal')[0], { status: 'pending', votesFor: 0, votesAgainst: 0, voters: null });
    const appealId = db.__rows('appeal')[0].id;

    const unsigned: any = await APPEAL(jsonReq({ action: 'vote', contentId: appealId, vote: 'restore', walletAddress: 'bc1psybil0000000000000000000000000000000000000' }));
    expect(unsigned.status).toBe(401);

    const voteBody = () => signedBody(STRANGER, VOTE_B, { action: 'vote', contentId: appealId, vote: 'restore', walletAddress: STRANGER.address });
    expect((await APPEAL(jsonReq(await voteBody())) as any).status).toBe(200);
    expect((await APPEAL(jsonReq(await voteBody())) as any).status).toBe(409);
  });
});

// ── POST /activity ──────────────────────────────────────────────────────
describe('POST /activity', () => {
  const ACT = { action: 'activity.log', method: 'POST', path: '/api/v1/activity', blockHeight: 0, purpose: 'activity' };

  it("refuses an unsigned entry for someone else's wallet (401) and writes no row", async () => {
    const res: any = await ACTIVITY(jsonReq({ action: 'wallet_connect', walletAddress: STRANGER.address }));
    expect(res.status).toBe(401);
    expect(db.__rows('activityLog')).toHaveLength(0);
  });

  it('refuses a signature over arbitrary text (401)', async () => {
    const message = 'hello';
    const res: any = await ACTIVITY(
      jsonReq({ action: 'wallet_connect', walletAddress: OWNER.address, message, signature: sign(OWNER.privKey, OWNER.address, message) })
    );
    expect(res.status).toBe(401);
    expect(db.__rows('activityLog')).toHaveLength(0);
  });

  it('logs a signed, nonce-backed entry under the signing wallet', async () => {
    const res: any = await ACTIVITY(jsonReq(await signedBody(OWNER, ACT, { action: 'delegation_list', walletAddress: OWNER.address, metadata: { blockHeight: BLOCK } })));
    expect(res.status).toBe(200);
    expect(db.__rows('activityLog')).toEqual([expect.objectContaining({ walletAddress: OWNER.address, action: 'delegation_list' })]);
  });
});
