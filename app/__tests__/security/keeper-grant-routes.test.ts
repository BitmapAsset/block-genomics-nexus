/**
 * SIMULATION: a block's holder connects one agent key with one wallet signature.
 *
 * POST /api/v1/keeper/grant/prepare builds the bg-grant/1 text and issues its
 * one-time nonce; POST /api/v1/keeper/grant accepts only that exact text, signed
 * by the wallet it names, with an unused nonce, while the live gate names that
 * wallet; DELETE /api/v1/keeper/grant ends the grant for the granting wallet or
 * the live holder. One grant per block. Every refusal is a fixed sentence and a
 * code, and nothing a caller submitted comes back in an answer or a log line.
 *
 * Real routes, real BIP-322 signatures; mocked seams: the database (in memory),
 * the live ownership answer and the rate limiter.
 */

const mockGate = jest.fn();
const mockLimit = jest.fn();

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Headers;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
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

jest.mock('@/lib/ownership-gate', () => ({
  ...jest.requireActual('@/lib/ownership-gate'),
  requireLiveBlockOwner: (...a: unknown[]) => mockGate(...a),
}));

jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: (...a: unknown[]) => mockLimit(...a),
  clientIpFrom: () => '203.0.113.7',
}));

import prisma from '@/lib/prisma';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { issueChallenge } from '@/lib/challenges';
import {
  buildGrantMessage,
  parseGrantMessage,
  keyCheck,
  GATE_RETRY_SENTENCE,
  KEEPER_SENTENCES,
  type GrantFields,
} from '@/lib/keeper-grant';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';
import { POST as PREPARE } from '@/app/api/v1/keeper/grant/prepare/route';
import { POST as GRANT, DELETE as REVOKE } from '@/app/api/v1/keeper/grant/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const HOLDER = makeWallet('p2wpkh');
const OTHER = makeWallet('p2tr');
const BLOCK = 612888;
const DAY = 24 * 60 * 60 * 1000;
const OPEN = { allowed: true, count: 1, limit: 20, resetAt: 0, retryAfterSec: 1 };

const keyOf = (byte: number) => 'ed25519:' + Buffer.alloc(32, byte).toString('base64url');

/** Every message and signature submitted in the current case (absent or empty ones skipped). */
let submitted: string[] = [];
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  db.__reset();
  submitted = [];
  mockGate.mockReset();
  mockGate.mockImplementation(async (w: string) => ({ ok: true, status: 200, walletAddress: w }));
  mockLimit.mockReset();
  mockLimit.mockResolvedValue(OPEN);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  try {
    for (const spy of [warnSpy, errorSpy, logSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          const text = typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg);
          for (const s of submitted) expect(text.includes(s)).toBe(false);
        }
      }
    }
  } finally {
    jest.restoreAllMocks();
  }
});

function request(body: unknown) {
  return {
    json: async () => JSON.parse(JSON.stringify(body)),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as any;
}

/** Call a handler; the answer must not carry the message or signature this request submitted. */
async function call(handler: (req: any) => Promise<any>, body: Record<string, unknown>): Promise<any> {
  const own = [body.message, body.signature].filter((v): v is string => typeof v === 'string' && v.length > 0);
  submitted.push(...own);
  const res = await handler(request(body));
  const text = JSON.stringify(res.body);
  for (const s of own) expect(text.includes(s)).toBe(false);
  return res;
}

async function bodyOf(res: any): Promise<any> {
  return res.json();
}

async function grantFlow(w: SimWallet, f: { blockHeight?: number; agentName?: string; agentKey?: string } = {}) {
  const prepRes = await call(PREPARE, {
    blockHeight: f.blockHeight ?? BLOCK,
    walletAddress: w.address,
    agentName: f.agentName ?? 'Helper',
    agentKey: f.agentKey ?? keyOf(1),
  });
  const message: string = (await bodyOf(prepRes)).data.message;
  const signature = sign(w.privKey, w.address, message);
  const res = await call(GRANT, { message, signature });
  return { message, signature, prepRes, res };
}

async function prepared(w: SimWallet = HOLDER) {
  const prepRes = await call(PREPARE, { blockHeight: BLOCK, walletAddress: w.address, agentName: 'Helper', agentKey: keyOf(1) });
  expect(prepRes.status).toBe(200);
  return (await bodyOf(prepRes)).data.message as string;
}

async function revokeBody(w: SimWallet, blockHeight: number) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: w.address, purpose: 'keeper' });
  const message = buildActionMessage({
    action: 'keeper.revoke',
    method: 'DELETE',
    path: '/api/v1/keeper/grant',
    blockHeight,
    bodyHash: await hashBody({ walletAddress: w.address, blockHeight }),
    nonce,
    expiresAt: Date.now() + 60_000,
  });
  return { walletAddress: w.address, blockHeight, message, signature: sign(w.privKey, w.address, message) };
}

/** A grant text built here (not by prepare) around a nonce issued for `purpose`. */
async function selfBuilt(w: SimWallet, purpose: string, over: Partial<GrantFields> = {}) {
  const nonce = freshNonce();
  const issued = await issueChallenge(nonce, { address: w.address, purpose });
  const fields: GrantFields = {
    blockHeight: BLOCK,
    walletAddress: w.address,
    agentName: 'Helper',
    agentKey: keyOf(1),
    scopes: ['inbox'],
    validUntil: new Date(Math.floor((Date.now() + 90 * DAY) / 1000) * 1000).toISOString(),
    nonce,
    expiresAt: issued.expiresAt.toISOString(),
    ...over,
  };
  return { nonce, message: buildGrantMessage(fields) };
}

const withLine = (text: string, index: number, line: string) => {
  const lines = text.split('\n');
  lines[index] = line;
  return lines.join('\n');
};

const challengeRow = (nonce: string) => db.__rows('challenge').find((r: any) => r.challenge === nonce);
const nonceIn = (message: string) => parseGrantMessage(message)!.nonce;

async function expectRefusal(res: any, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await bodyOf(res);
  expect(body.success).toBe(false);
  expect(body.code).toBe(code);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  return body;
}

describe('POST /api/v1/keeper/grant/prepare', () => {
  it('(G2) answers the exact text to sign, with a keeper nonce for the wallet, and stores no grant', async () => {
    const t0 = Date.now();
    const res = await call(PREPARE, { blockHeight: BLOCK, walletAddress: HOLDER.address, agentName: 'Helper', agentKey: keyOf(1) });
    const t1 = Date.now();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { message, keyCheck: kc, expiresAt } = (await bodyOf(res)).data;
    const row = db.__rows('challenge')[0];
    const validUntil = parseGrantMessage(message)!.validUntil;
    expect(message).toBe(buildGrantMessage({
      blockHeight: BLOCK,
      walletAddress: HOLDER.address,
      agentName: 'Helper',
      agentKey: keyOf(1),
      scopes: ['inbox'],
      nonce: row.challenge,
      expiresAt: row.expiresAt.toISOString(),
      validUntil,
    }));
    expect(validUntil.endsWith('.000Z')).toBe(true);
    expect(Date.parse(validUntil)).toBeGreaterThanOrEqual(t0 + 90 * DAY - 1000);
    expect(Date.parse(validUntil)).toBeLessThanOrEqual(t1 + 90 * DAY);
    expect(row.purpose).toBe('keeper');
    expect(row.address).toBe(HOLDER.address);
    expect(expiresAt).toBe(row.expiresAt.toISOString());
    expect(Date.parse(expiresAt)).toBeGreaterThanOrEqual(t0 + 10 * 60 * 1000 - 2000);
    expect(Date.parse(expiresAt)).toBeLessThanOrEqual(t1 + 10 * 60 * 1000 + 2000);
    expect(kc).toBe(keyCheck(keyOf(1)));
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G8) refuses a hostile agent name, issues nothing and does not echo it', async () => {
    for (const name of ['Allows: build', 'x\nAllows: all', 'Hel"per', 'a'.repeat(200)]) {
      const res = await call(PREPARE, { blockHeight: BLOCK, walletAddress: HOLDER.address, agentName: name, agentKey: keyOf(1) });
      const body = await expectRefusal(res, 400, 'bad_agent_name');
      expect(JSON.stringify(body).includes(JSON.stringify(name).slice(1, -1))).toBe(false);
      expect(body.error).toBe(KEEPER_SENTENCES.bad_agent_name);
    }
    expect(db.__rows('challenge')).toHaveLength(0);
  });

  it('(G26) refuses a scope this wave does not have, at prepare and inside a text', async () => {
    const res = await call(PREPARE, { blockHeight: BLOCK, walletAddress: HOLDER.address, agentName: 'Helper', agentKey: keyOf(1), scopes: ['speak'] });
    await expectRefusal(res, 400, 'bad_scopes');
    expect(db.__rows('challenge')).toHaveLength(0);

    const { nonce, message: built } = await selfBuilt(HOLDER, 'keeper');
    const message = withLine(built, 7, 'Allows: answer visitors as the guardian');
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    await expectRefusal(await call(GRANT, { message, signature }), 400, 'bad_grant_text');
    expect(challengeRow(nonce).consumedAt).toBeNull();
  });
});

describe('POST /api/v1/keeper/grant', () => {
  it('(G3) the signed text from prepare writes one grant for the block', async () => {
    const { message, res } = await grantFlow(HOLDER);
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await bodyOf(res)).data).toEqual({
      blockHeight: BLOCK,
      agentName: 'Helper',
      keyCheck: keyCheck(keyOf(1)),
      scopes: ['inbox'],
      validUntil: parseGrantMessage(message)!.validUntil,
      replaced: false,
    });
    const rows = db.__rows('keeperGrant');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ blockHeight: BLOCK, walletAddress: HOLDER.address, agentKey: keyOf(1), message });
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockGate).toHaveBeenCalledWith(HOLDER.address, BLOCK);
  });

  it('(G3b) legacy and wrapped segwit holders grant too', async () => {
    const legacy = await grantFlow(makeWallet('p2pkh'), { blockHeight: 612889 });
    expect(legacy.res.status).toBe(201);
    const wrapped = await grantFlow(makeWallet('p2sh-p2wpkh'), { blockHeight: 612890 });
    expect(wrapped.res.status).toBe(201);
    expect(db.__rows('keeperGrant')).toHaveLength(2);
  });

  it('(G4) the same signed text twice: the nonce is used, the gate is not asked again', async () => {
    const { message, signature, res } = await grantFlow(HOLDER);
    expect(res.status).toBe(201);
    await expectRefusal(await call(GRANT, { message, signature }), 401, 'nonce_used');
    expect(db.__rows('keeperGrant')).toHaveLength(1);
    expect(mockGate).toHaveBeenCalledTimes(1);
  });

  it('(G5) a text naming the holder signed by another wallet is refused and keeps its nonce', async () => {
    const message = await prepared();
    await expectRefusal(await call(GRANT, { message, signature: sign(OTHER.privKey, OTHER.address, message) }), 401, 'bad_signature');
    expect(challengeRow(nonceIn(message)).consumedAt).toBeNull();
    const ok = await call(GRANT, { message, signature: sign(HOLDER.privKey, HOLDER.address, message) });
    expect(ok.status).toBe(201);
  });

  it('(G6) another agent key in a signed text breaks the signature', async () => {
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const kc1 = keyCheck(keyOf(1));
    const kc2 = keyCheck(keyOf(2));
    let changed = withLine(message, 0, message.split('\n')[0].replace(kc1, kc2));
    changed = withLine(changed, 5, `Agent key: ${keyOf(2)}`);
    changed = withLine(changed, 6, `Key check: ${kc2}`);
    expect(buildGrantMessage(parseGrantMessage(changed)!)).toBe(changed);
    await expectRefusal(await call(GRANT, { message: changed, signature }), 401, 'bad_signature');
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G7) a text the server did not build is refused even when the holder signed it', async () => {
    const message = withLine(await prepared(), 8, 'Never: nothing');
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    await expectRefusal(await call(GRANT, { message, signature }), 400, 'bad_grant_text');
    expect(challengeRow(nonceIn(message)).consumedAt).toBeNull();
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G7b) a trailing newline is not the server text', async () => {
    const message = (await prepared()) + '\n';
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    await expectRefusal(await call(GRANT, { message, signature }), 400, 'bad_grant_text');
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G9) a wallet the live gate does not name: 403 with the gate reason, nothing written, nonce used', async () => {
    const denial = {
      ok: false,
      status: 403,
      code: 'ownership_lost',
      reason: 'Block 612888 is not held by this wallet on-chain. Ownership check failed.',
    };
    mockGate.mockResolvedValue(denial);
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const body = await expectRefusal(await call(GRANT, { message, signature }), 403, 'ownership_lost');
    expect(body.error).toBe(denial.reason);
    expect(db.__rows('keeperGrant')).toHaveLength(0);
    await expectRefusal(await call(GRANT, { message, signature }), 401, 'nonce_used');
  });

  it('(G10) the gate cannot answer: 503 that says to sign again, nonce used, nothing written', async () => {
    mockGate.mockResolvedValue({
      ok: false,
      status: 503,
      code: 'onchain_unavailable',
      reason: 'On-chain ownership could not be confirmed right now. Retry shortly.',
    });
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const res = await call(GRANT, { message, signature });
    const body = await expectRefusal(res, 503, 'onchain_unavailable');
    expect(body.error).toBe(GATE_RETRY_SENTENCE);
    expect(res.headers.get('Retry-After')).toBe('15');
    expect(db.__rows('keeperGrant')).toHaveLength(0);
    expect(challengeRow(nonceIn(message)).consumedAt).not.toBeNull();
  });

  it('(G11) a second grant on the block replaces the first', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    const second = await grantFlow(HOLDER, { agentKey: keyOf(2) });
    expect(second.res.status).toBe(201);
    expect((await bodyOf(second.res)).data.replaced).toBe(true);
    const rows = db.__rows('keeperGrant');
    expect(rows).toHaveLength(1);
    expect(rows[0].agentKey).toBe(keyOf(2));
  });

  it('(G12) only the text fields count: other keys in the body are ignored', async () => {
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const res = await call(GRANT, { message, signature, blockHeight: 720143, walletAddress: OTHER.address });
    expect(res.status).toBe(201);
    const rows = db.__rows('keeperGrant');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ blockHeight: BLOCK, walletAddress: HOLDER.address });
    expect(rows.some((r: any) => r.blockHeight === 720143)).toBe(false);
  });

  it('(G13) a nonce issued for another purpose does not serve a grant', async () => {
    const { message } = await selfBuilt(HOLDER, 'world');
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    await expectRefusal(await call(GRANT, { message, signature }), 401, 'nonce_used');
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G14) the clock: lifetime, expired text and an expiry too far ahead, nonce kept each time', async () => {
    const now = Date.now();
    const cases: Array<[Partial<GrantFields>, string]> = [
      [{ validUntil: new Date(Math.floor((now + 400 * DAY) / 1000) * 1000).toISOString() }, 'bad_valid_until'],
      [{ expiresAt: new Date(now - 60_000).toISOString() }, 'grant_text_expired'],
      [{ expiresAt: new Date(now + 20 * 60 * 1000).toISOString() }, 'bad_expires'],
    ];
    for (const [over, code] of cases) {
      const { nonce, message } = await selfBuilt(HOLDER, 'keeper', over);
      const signature = sign(HOLDER.privKey, HOLDER.address, message);
      await expectRefusal(await call(GRANT, { message, signature }), 400, code);
      expect(challengeRow(nonce).consumedAt).toBeNull();
    }
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G22) an oversized text is refused before any nonce or chain work', async () => {
    const updateMany = jest.spyOn(db.challenge, 'updateMany');
    const res = await call(GRANT, { message: 'x'.repeat(100_000), signature: 'zq'.repeat(8) });
    await expectRefusal(res, 400, 'bad_grant_text');
    expect(updateMany).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
  });

  it('(G24) a failing store or gate answers 503 without its error text', async () => {
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const spy = jest.spyOn(db.challenge, 'updateMany').mockRejectedValue({ code: 'P1001' });
    await expectRefusal(await call(GRANT, { message, signature }), 503, 'keeper_unavailable');
    expect(errorSpy).toHaveBeenCalledWith('[keeper] route failed:', 'P1001');
    expect(db.__rows('keeperGrant')).toHaveLength(0);
    spy.mockRestore();

    const message2 = await prepared();
    const signature2 = sign(HOLDER.privKey, HOLDER.address, message2);
    mockGate.mockRejectedValue(new Error('gate down ' + message2));
    const res = await call(GRANT, { message: message2, signature: signature2 });
    const body = await expectRefusal(res, 503, 'keeper_unavailable');
    expect(JSON.stringify(body).includes('gate down')).toBe(false);
    for (const s of [warnSpy, errorSpy, logSpy]) {
      for (const c of s.mock.calls) expect(JSON.stringify(c).includes('gate down')).toBe(false);
    }
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });
});

describe('DELETE /api/v1/keeper/grant', () => {
  it('(G15) the granting wallet ends its grant without asking the chain', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    mockGate.mockClear();
    const res = await call(REVOKE, await revokeBody(HOLDER, BLOCK));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await bodyOf(res)).data).toEqual({ revoked: true, blockHeight: BLOCK });
    expect(db.__rows('keeperGrant')).toHaveLength(0);
    expect(mockGate).not.toHaveBeenCalled();
  });

  it('(G16) another wallet ends it only while the live gate names it', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    mockGate.mockResolvedValueOnce({ ok: false, status: 403, code: 'ownership_lost', reason: 'Block 612888 is not held by this wallet on-chain. Ownership check failed.' });
    await expectRefusal(await call(REVOKE, await revokeBody(OTHER, BLOCK)), 403, 'ownership_lost');
    expect(db.__rows('keeperGrant')).toHaveLength(1);
    const res = await call(REVOKE, await revokeBody(OTHER, BLOCK));
    expect(res.status).toBe(200);
    expect(db.__rows('keeperGrant')).toHaveLength(0);
  });

  it('(G17) a revoke without a signature gets the pointer to the challenge', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    const body: Record<string, unknown> = await revokeBody(HOLDER, BLOCK);
    delete body.signature;
    const answer = await expectRefusal(await call(REVOKE, body), 401, 'bad_signature');
    expect(answer.error).toContain('POST /api/v1/challenge');
    expect(answer.error).toContain('keeper');
    expect(db.__rows('keeperGrant')).toHaveLength(1);
  });

  it('(G18) a signed revoke for a block without a grant: 404, nonce used', async () => {
    const body = await revokeBody(HOLDER, 700001);
    await expectRefusal(await call(REVOKE, body), 404, 'no_grant');
    const nonce = db.__rows('challenge')[0].challenge;
    expect(challengeRow(nonce).consumedAt).not.toBeNull();
  });

  it('(G18b) an unsigned revoke learns nothing about the block', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    await expectRefusal(await call(REVOKE, { walletAddress: HOLDER.address, blockHeight: BLOCK }), 401, 'bad_signature');
    await expectRefusal(await call(REVOKE, { walletAddress: HOLDER.address, blockHeight: 700002 }), 401, 'bad_signature');
    expect(db.__rows('keeperGrant')).toHaveLength(1);
  });

  it('(G23) a revoke removes only the grant it read', async () => {
    expect((await grantFlow(HOLDER)).res.status).toBe(201);
    const old = { ...db.__rows('keeperGrant')[0] };
    expect((await grantFlow(OTHER, { agentKey: keyOf(2) })).res.status).toBe(201);
    jest.spyOn(db.keeperGrant, 'findUnique').mockResolvedValueOnce(old);
    await expectRefusal(await call(REVOKE, await revokeBody(HOLDER, BLOCK)), 409, 'grant_changed');
    const rows = db.__rows('keeperGrant');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ walletAddress: OTHER.address, agentKey: keyOf(2) });
  });

  it('(G25) a block height as a string is refused', async () => {
    await expectRefusal(await call(REVOKE, { walletAddress: HOLDER.address, blockHeight: '612888' }), 400, 'bad_block');
  });
});

describe('every keeper route', () => {
  it('(G19) a missing table answers 503 keeper_unavailable and writes nothing', async () => {
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    const upsert = jest.spyOn(db.keeperGrant, 'upsert').mockRejectedValue({ code: 'P2021' });
    const g = await call(GRANT, { message, signature });
    await expectRefusal(g, 503, 'keeper_unavailable');
    expect(g.headers.get('Retry-After')).toBe('60');
    upsert.mockRestore();
    expect(db.__rows('keeperGrant')).toHaveLength(0);

    const revoke = await revokeBody(HOLDER, BLOCK);
    const revokeNonce = db.__rows('challenge')[db.__rows('challenge').length - 1].challenge;
    const challengesBefore = db.__rows('challenge').length;
    jest.spyOn(db.keeperGrant, 'findUnique').mockRejectedValue({ code: 'P2021' });
    const p = await call(PREPARE, { blockHeight: BLOCK, walletAddress: HOLDER.address, agentName: 'Helper', agentKey: keyOf(1) });
    await expectRefusal(p, 503, 'keeper_unavailable');
    expect(p.headers.get('Retry-After')).toBe('60');
    expect(db.__rows('challenge')).toHaveLength(challengesBefore);
    const d = await call(REVOKE, revoke);
    await expectRefusal(d, 503, 'keeper_unavailable');
    expect(d.headers.get('Retry-After')).toBe('60');
    expect(challengeRow(revokeNonce).consumedAt).toBeNull();

    expect(errorSpy).toHaveBeenCalled();
    for (const c of errorSpy.mock.calls) expect(c).toEqual(['[keeper] store unavailable:', 'P2021']);
  });

  it('(G20) bursts are refused with Retry-After before any work', async () => {
    const message = await prepared();
    const signature = sign(HOLDER.privKey, HOLDER.address, message);
    mockLimit.mockResolvedValue({ allowed: false, count: 21, limit: 20, resetAt: 0, retryAfterSec: 42 });
    const p = await call(PREPARE, { blockHeight: BLOCK, walletAddress: HOLDER.address, agentName: 'Helper', agentKey: keyOf(1) });
    const g = await call(GRANT, { message, signature });
    const d = await call(REVOKE, { walletAddress: HOLDER.address, blockHeight: BLOCK });
    for (const res of [p, g, d]) {
      await expectRefusal(res, 429, 'rate_limited');
      expect(res.headers.get('Retry-After')).toBe('42');
    }
    expect(db.__rows('challenge')).toHaveLength(1);
    expect(db.__rows('challenge')[0].consumedAt).toBeNull();
    expect(db.__rows('keeperGrant')).toHaveLength(0);
    expect(mockGate).not.toHaveBeenCalled();
  });
});
