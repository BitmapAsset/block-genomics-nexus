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
  ESTATE_WRITE_LIMIT: 20,
}));

const mockCreateInvoice = jest.fn(async () => ({ bolt11: 'lnbc1...', invoiceId: 'inv_1' }));
jest.mock('@/lib/lightning', () => ({ createLightningInvoice: (...args: unknown[]) => mockCreateInvoice(...(args as [])) }));
const mockLiveOwner = jest.fn();
jest.mock('@/lib/ownership-gate', () => ({ requireLiveBlockOwner: (...args: unknown[]) => mockLiveOwner(...(args as [])) }));

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as INVOICE } from '@/app/api/v1/lightning/invoice/route';
import { DELETE as END_STREAM, POST as START_STREAM } from '@/app/api/v1/livestream/route';
import { POST as APPEAL } from '@/app/api/v1/brain/appeal/route';
import { POST as ACTIVITY } from '@/app/api/v1/activity/route';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const OWNER = makeWallet('p2tr');
const STRANGER = makeWallet('p2tr');
const NEWHOLDER = makeWallet('p2tr');
const THIRD = makeWallet('p2tr');
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
  mockRateLimit.mockReset().mockImplementation(async () => ({ response: null as unknown, headers: {} }));
  mockLiveOwner.mockReset().mockResolvedValue({ ok: false, status: 403, code: 'ownership_lost', reason: 'Block 840000 is not held by this wallet on-chain.' });
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
    expect(mockLiveOwner).toHaveBeenCalledTimes(1);
    expect(mockLiveOwner).toHaveBeenCalledWith(STRANGER.address, BLOCK);
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

  const HOLDS = () => ({ ok: true, status: 200, walletAddress: NEWHOLDER.address });
  const holderEnd = () => signedBody(NEWHOLDER, END, { blockHeight: BLOCK, ownerAddress: NEWHOLDER.address });

  it("U1 the wallet that holds the block now ends the starter's stream with its own signed body", async () => {
    mockLiveOwner.mockResolvedValueOnce(HOLDS());
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(200);
    expect(await streamOwner()).toBeNull();
  });

  it('U3 the gate answers 503', async () => {
    const reason = 'On-chain ownership could not be confirmed right now. Retry shortly.';
    mockLiveOwner.mockResolvedValueOnce({ ok: false, status: 503, code: 'onchain_unavailable', reason });
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(reason);
    expect(res.headers.get('Retry-After')).toBe('15');
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it("U4 holder's replay: U1's body sent twice", async () => {
    const body = await holderEnd();
    mockLiveOwner.mockResolvedValueOnce(HOLDS());
    const res: any = await END_STREAM(jsonReq(body));
    expect(res.status).toBe(200);

    await db.block.update({ where: { height: BLOCK }, data: { streamOwner: OWNER.address, streamUrl: 'https://youtu.be/abc' } });
    const replay: any = await END_STREAM(jsonReq(body));
    expect(replay.status).toBe(401);
    expect(mockLiveOwner).toHaveBeenCalledTimes(1);
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it('U5 another block: NEWHOLDER signs the binding for block BLOCK + 1 with body { blockHeight: BLOCK, ownerAddress }, gate ok', async () => {
    mockLiveOwner.mockResolvedValue(HOLDS());
    const body = await signedBody(NEWHOLDER, { ...END, blockHeight: BLOCK + 1 }, { blockHeight: BLOCK, ownerAddress: NEWHOLDER.address });
    const res: any = await END_STREAM(jsonReq(body));
    expect(res.status).toBe(401);
    expect(await streamOwner()).toBe(OWNER.address);
    expect(mockLiveOwner).not.toHaveBeenCalled();
  });

  it("U6 another action: NEWHOLDER signs action: 'livestream.start', gate ok", async () => {
    mockLiveOwner.mockResolvedValue(HOLDS());
    const body = await signedBody(NEWHOLDER, { ...END, action: 'livestream.start' }, { blockHeight: BLOCK, ownerAddress: NEWHOLDER.address });
    const res: any = await END_STREAM(jsonReq(body));
    expect(res.status).toBe(401);
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it("U7 changed body: NEWHOLDER's signed body, then note: 'x' added before sending, gate ok", async () => {
    mockLiveOwner.mockResolvedValue(HOLDS());
    const body = await holderEnd();
    const res: any = await END_STREAM(jsonReq({ ...body, note: 'x' }));
    expect(res.status).toBe(401);
    expect(await streamOwner()).toBe(OWNER.address);
  });

  it("U8 a block without a stream, NEWHOLDER's signed end, gate ok", async () => {
    await db.block.update({ where: { height: BLOCK }, data: { streamUrl: null, streamType: null, streamStartedAt: null, streamOwner: null } });
    mockLiveOwner.mockResolvedValue(HOLDS());
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Not the stream owner');
    expect(mockLiveOwner).not.toHaveBeenCalled();
  });

  it("U9 a start by another wallet lands between the read and the clear, NEWHOLDER's signed end", async () => {
    mockLiveOwner.mockImplementationOnce(async () => {
      // The new start lands as a new row value. The memory store hands out its
      // stored objects, so an in-place update would also change the route's
      // earlier read; a database read is a copy, which this models.
      const rows = db.__rows('block');
      const i = rows.findIndex((r: any) => r.height === BLOCK);
      rows[i] = { ...rows[i], streamOwner: THIRD.address, streamUrl: 'https://youtu.be/xyz' };
      return HOLDS();
    });
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('The stream changed. Nothing was ended.');
    const row = await db.block.findUnique({ where: { height: BLOCK } });
    expect(row.streamOwner).toBe(THIRD.address);
    expect(row.streamUrl).toBe('https://youtu.be/xyz');
  });

  it("U10 the limiter refuses an end: OWNER's signed end; then the same body again", async () => {
    mockRateLimit.mockResolvedValueOnce({ response: { status: 429 }, headers: {} });
    const body = await signedBody(OWNER, END, { blockHeight: BLOCK, ownerAddress: OWNER.address });
    const res: any = await END_STREAM(jsonReq(body));
    expect(res.status).toBe(429);
    expect(await streamOwner()).toBe(OWNER.address);
    expect(mockLiveOwner).not.toHaveBeenCalled();
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bucket: 'v1-livestream-write', limit: 20 }));

    const again: any = await END_STREAM(jsonReq(body));
    expect(again.status).toBe(200);
  });

  it('U11 the limiter refuses a start', async () => {
    mockRateLimit.mockResolvedValueOnce({ response: { status: 429 }, headers: {} });
    const res: any = await START_STREAM(
      jsonReq({ blockHeight: BLOCK, streamUrl: 'https://www.twitch.tv/somechannel', walletAddress: NEWHOLDER.address, signature: 'x', message: 'y' }),
    );
    expect(res.status).toBe(429);
    expect(await streamOwner()).toBe(OWNER.address);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bucket: 'v1-livestream-write', limit: 20 }));
  });

  it("U14 a new start by the same wallet lands between the read and the clear, NEWHOLDER's signed end: the new stream is kept", async () => {
    const before = (await db.block.findUnique({ where: { height: BLOCK } })).streamStartedAt as Date;
    const restarted = new Date(before.getTime() + 1000);
    mockLiveOwner.mockImplementationOnce(async () => {
      // As in U9 the new start lands as a new row value: the same wallet, a later start time, another link.
      const rows = db.__rows('block');
      const i = rows.findIndex((r: any) => r.height === BLOCK);
      rows[i] = { ...rows[i], streamUrl: 'https://youtu.be/xyz', streamStartedAt: restarted };
      return HOLDS();
    });
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('The stream changed. Nothing was ended.');
    const row = await db.block.findUnique({ where: { height: BLOCK } });
    expect(row.streamOwner).toBe(OWNER.address);
    expect(row.streamUrl).toBe('https://youtu.be/xyz');
    expect(row.streamStartedAt).toEqual(restarted);
  });

  it("U15 another end lands between the read and the clear, NEWHOLDER's signed end: 409 and nothing more is ended", async () => {
    mockLiveOwner.mockImplementationOnce(async () => {
      const rows = db.__rows('block');
      const i = rows.findIndex((r: any) => r.height === BLOCK);
      rows[i] = { ...rows[i], streamUrl: null, streamType: null, streamStartedAt: null, streamOwner: null };
      return HOLDS();
    });
    const res: any = await END_STREAM(jsonReq(await holderEnd()));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('The stream changed. Nothing was ended.');
    expect(await streamOwner()).toBeNull();
  });
});

// ── POST /livestream ────────────────────────────────────────────────────
describe('POST /livestream', () => {
  const START = { action: 'livestream.start', method: 'POST', path: '/api/v1/livestream', blockHeight: BLOCK, purpose: 'world' };
  const HOLDS = () => ({ ok: true, status: 200, walletAddress: NEWHOLDER.address });
  const row = async () => db.block.findUnique({ where: { height: BLOCK } });
  const holderStart = (intent: Record<string, unknown>) =>
    signedBody(NEWHOLDER, START, { blockHeight: BLOCK, streamUrl: 'https://www.twitch.tv/somechannel', walletAddress: NEWHOLDER.address, ...intent });

  beforeEach(async () => {
    await db.block.create({ data: { height: BLOCK } });
  });

  it('U12 a signed start by the holder stores one of three stream types; anything else is stored as a broadcast', async () => {
    mockLiveOwner.mockResolvedValue(HOLDS());
    const cases: [unknown, string][] = [['x'.repeat(5000), 'broadcast'], ['spatial', 'spatial'], [7, 'broadcast']];
    for (const [streamType, stored] of cases) {
      const res: any = await START_STREAM(jsonReq(await holderStart({ streamType })));
      expect(res.status).toBe(200);
      const label = typeof streamType === 'string' ? `text of ${streamType.length}` : String(streamType);
      expect([label, (await row()).streamType]).toEqual([label, stored]);
    }
  });

  it('U13 a link of more than 500 characters is refused before any signature or chain work; one of exactly 500 is stored', async () => {
    mockLiveOwner.mockResolvedValue(HOLDS());
    const long = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=' + 'a'.repeat(501 - 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&x='.length);
    expect(long).toHaveLength(501);
    const refused = { ...(await holderStart({ streamUrl: long })), signature: 'not-a-valid-signature' };
    const res: any = await START_STREAM(jsonReq(refused));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That stream link is too long. Paste the plain link to your stream.' });
    expect(mockLiveOwner).not.toHaveBeenCalled();
    expect(db.__rows('challenge').map((c: any) => c.consumedAt)).toEqual([null]);
    expect((await row()).streamUrl ?? null).toBeNull();

    const exact = long.slice(0, 500);
    expect(exact).toHaveLength(500);
    const ok: any = await START_STREAM(jsonReq(await holderStart({ streamUrl: exact })));
    expect(ok.status).toBe(200);
    expect((await row()).streamOwner).toBe(NEWHOLDER.address);
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
