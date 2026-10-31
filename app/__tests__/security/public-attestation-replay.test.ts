/**
 * SIMULATION — a published owner signature authorizes nothing (bg58, extends
 * E2E-06).
 *
 * An experience registration publishes the owner's `manifestSignature` +
 * `manifestMessage` on purpose (third-party verifiability). Every signed write
 * now verifies the canonical action message for its own action, path, block and
 * body, and consumes the one-time nonce inside it, so that public pair, an
 * ad-hoc string the wallet signed, or a challenge text all fail; only the
 * signature made for this exact request works, once. The full per-route matrix
 * is in signed-action-routes.test.ts.
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

const BLOCK = 840000;

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

let chainOwner = '';
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string) =>
    wallet === chainOwner ? { verified: true } : { verified: false, reason: 'not held by this wallet' },
}));
jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async (wallet: string) =>
    wallet === chainOwner
      ? { ok: true, status: 200, walletAddress: wallet }
      : { ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' },
  gateDenialResponse: (gate: { status: number; reason?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason }, { status: gate.status });
  },
}));

import prisma from '@/lib/prisma';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { issueChallenge } from '@/lib/challenges';
import { DELETE as QUEST_DELETE } from '@/app/api/v1/game/quests/[id]/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const owner = makeWallet('p2tr');

/** The tuple an experience registration publishes on purpose. */
async function manifestTuple() {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: owner.address, purpose: 'experience-register' });
  const message = buildActionMessage({
    action: 'experience.register', method: 'POST', path: '/api/v1/experiences', blockHeight: BLOCK,
    bodyHash: 'c3'.repeat(32), nonce, expiresAt: Date.now() + 60_000,
  });
  return { message, signature: sign(owner.privKey, owner.address, message) };
}

function deleteReq(message: string, signature: string) {
  return { json: async () => ({ ownerAddress: owner.address, message, signature }) } as never;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const del = async (message: string, signature: string) =>
  (await QUEST_DELETE(deleteReq(message, signature), params('q1'))) as unknown as { status: number };

beforeEach(() => {
  db.__reset();
  db.__rows('gameQuest').push({ id: 'q1', blockHeight: BLOCK, ownerAddress: owner.address });
  chainOwner = owner.address;
});

const questExists = () => db.__rows('gameQuest').some((q: any) => q.id === 'q1');

describe('DELETE /api/v1/game/quests/[id]', () => {
  it('rejects the owner signature lifted from a public experience record', async () => {
    const { message, signature } = await manifestTuple();
    expect((await del(message, signature)).status).toBe(401);
    expect(questExists()).toBe(true);
  });

  it('rejects a real signature over an ad-hoc string', async () => {
    const msg = `quest-delete:q1:${Date.now()}`;
    expect((await del(msg, sign(owner.privKey, owner.address, msg))).status).toBe(401);
    expect(questExists()).toBe(true);
  });

  it('rejects a real signature over a challenge text, even with a live nonce', async () => {
    const nonce = freshNonce();
    await issueChallenge(nonce, { address: owner.address, purpose: 'world' });
    const msg = challengeMessage(nonce);
    expect((await del(msg, sign(owner.privKey, owner.address, msg))).status).toBe(401);
    expect(questExists()).toBe(true);
  });

  it('lets the owner delete with the bound signature for this request, once', async () => {
    const nonce = freshNonce();
    await issueChallenge(nonce, { address: owner.address, purpose: 'world' });
    const message = buildActionMessage({
      action: 'game.quest.delete', method: 'DELETE', path: '/api/v1/game/quests/q1', blockHeight: 0,
      bodyHash: await hashBody({ ownerAddress: owner.address }), nonce, expiresAt: Date.now() + 60_000,
    });
    const signature = sign(owner.privKey, owner.address, message);
    expect((await del(message, signature)).status).toBe(200);
    expect(questExists()).toBe(false);

    db.__rows('gameQuest').push({ id: 'q1', blockHeight: BLOCK, ownerAddress: owner.address });
    expect((await del(message, signature)).status).toBe(401);
    expect(questExists()).toBe(true);
  });
});
