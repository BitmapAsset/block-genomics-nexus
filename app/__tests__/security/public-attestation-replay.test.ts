/**
 * SIMULATION — a published owner signature must not authorize the legacy
 * "any message" routes (bg58, extends E2E-06).
 *
 * An experience registration publishes the owner's `manifestSignature` +
 * `manifestMessage` on purpose (third-party verifiability). The legacy routes
 * accept any message the wallet signed, with no nonce and no action binding, so
 * that public pair was a working credential: anyone could lift it from
 * `GET /api/v1/experiences` and delete the owner's quests, edit their profile,
 * or reconfigure their guardian as the owner.
 *
 * Those routes now refuse the two message shapes the server issues for bound
 * flows — an action-bound `Block Genomics Authorization` message and a
 * challenge-nonce message — while the ad-hoc strings their clients sign keep
 * working. Bound routes keep accepting both shapes through
 * `verifyWalletSignature`.
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
const quests = new Map<string, { id: string; blockHeight: number; ownerAddress: string }>();

jest.mock('@/lib/prisma', () => {
  const client = {
    gameQuest: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => quests.get(id) ?? null,
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        const row = quests.get(id);
        quests.delete(id);
        return row;
      },
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

let chainOwner = '';
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string) =>
    wallet === chainOwner ? { verified: true } : { verified: false, reason: 'not held by this wallet' },
}));

import { verifyUnboundWalletSignature, verifyWalletSignature } from '@/lib/api-helpers';
import { DELETE as QUEST_DELETE } from '@/app/api/v1/game/quests/[id]/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/** The shape `buildActionMessage` emits for an experience registration. */
function manifestMessage(nonce: string): string {
  return [
    'Block Genomics Authorization v1',
    'Action: experience.register',
    'Method: POST',
    'Path: /api/v1/experiences',
    `Block: ${BLOCK}`,
    `Body: ${'c3'.repeat(32)}`,
    `Nonce: ${nonce}`,
    'Expires: 1792000000000',
  ].join('\n');
}

const owner = makeWallet('p2tr');

function deleteReq(message: string, signature: string) {
  return { json: async () => ({ ownerAddress: owner.address, message, signature }) } as never;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  quests.clear();
  quests.set('q1', { id: 'q1', blockHeight: BLOCK, ownerAddress: owner.address });
  chainOwner = owner.address;
});

describe('verifyUnboundWalletSignature', () => {
  it('accepts a real signature over an ad-hoc client string', () => {
    const msg = `guardian-config:${BLOCK}:${owner.address}:1760000000000`;
    expect(verifyUnboundWalletSignature(owner.address, msg, sign(owner.privKey, owner.address, msg))).toBe(true);
  });

  it('refuses a real signature over an action-bound message', () => {
    const msg = manifestMessage(freshNonce());
    const sig = sign(owner.privKey, owner.address, msg);
    expect(verifyWalletSignature(owner.address, msg, sig)).toBe(true); // bound routes still verify it
    expect(verifyUnboundWalletSignature(owner.address, msg, sig)).toBe(false);
  });

  it('refuses a real signature over a challenge-nonce message', () => {
    const msg = challengeMessage(freshNonce());
    const sig = sign(owner.privKey, owner.address, msg);
    expect(verifyWalletSignature(owner.address, msg, sig)).toBe(true);
    expect(verifyUnboundWalletSignature(owner.address, msg, sig)).toBe(false);
  });

  it('still refuses a forged signature over an ad-hoc string', () => {
    const other = makeWallet('p2wpkh');
    const msg = 'chat:1760000000000';
    expect(verifyUnboundWalletSignature(owner.address, msg, sign(other.privKey, other.address, msg))).toBe(false);
  });
});

describe('DELETE /api/v1/game/quests/[id] with a published attestation', () => {
  it('rejects the owner signature lifted from a public experience record', async () => {
    const msg = manifestMessage(freshNonce());
    const res = (await QUEST_DELETE(deleteReq(msg, sign(owner.privKey, owner.address, msg)), params('q1'))) as unknown as {
      status: number;
    };
    expect(res.status).toBe(401);
    expect(quests.has('q1')).toBe(true);
  });

  it('still lets the owner delete with an ad-hoc signed string', async () => {
    const msg = `quest-delete:q1:${Date.now()}`;
    const res = (await QUEST_DELETE(deleteReq(msg, sign(owner.privKey, owner.address, msg)), params('q1'))) as unknown as {
      status: number;
    };
    expect(res.status).toBe(200);
    expect(quests.has('q1')).toBe(false);
  });
});
