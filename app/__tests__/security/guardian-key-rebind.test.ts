/**
 * bg56 Q-14 / Q-01c — a guardian's encrypted LLM key is decrypted and sent, as a
 * bearer token, to wherever `llmEndpoint` points. A block can change hands while
 * the guardian row (and the SELLER's encrypted key) survives the release, and
 * `PATCH /api/v1/guardian/[id]` authorizes the LIVE block owner. So the new owner
 * could repoint the endpoint at a server they control and harvest the previous
 * owner's key on the next chat.
 *
 * Fix: changing the destination (endpoint / provider / host mode) WITHOUT
 * supplying a fresh key clears the stored key, so an inherited key can never be
 * redirected. Supplying a new key alongside the new endpoint is allowed.
 *
 * Real route + real BIP-322 signatures; mocked seams: DB, key encryption, the
 * ownership gate (chainOwner IS the live deed).
 */

let chainOwner: Record<number, string> = {};

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

// Encryption is opaque here — we only care WHETHER a key is stored, and that a
// freshly-supplied key is (re)encrypted rather than dropped.
jest.mock('@/lib/key-encryption', () => ({
  encryptApiKey: (k: string) => `enc(${k})`,
  maskApiKey: () => '••••',
}));

jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async (wallet: string, height: number) =>
    chainOwner[height] === wallet
      ? { ok: true, status: 200, walletAddress: wallet }
      : { ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' },
  gateDenialResponse: (gate: { status: number; reason?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason }, { status: gate.status });
  },
}));

import prisma from '@/lib/prisma';
import { PATCH } from '@/app/api/v1/guardian/[id]/route';
import { POST } from '@/app/api/v1/guardian/route';
import { makeWallet, sign } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const SELLER = makeWallet('p2tr');
const BUYER = makeWallet('p2tr');

function patchReq(wallet: ReturnType<typeof makeWallet>, body: Record<string, unknown>) {
  const message = `guardian-config:${BLOCK}:${wallet.address}:${Date.now()}`;
  const signature = sign(wallet.privKey, wallet.address, message);
  return {
    json: async () => ({ ownerAddress: wallet.address, signature, message, ...body }),
  } as any;
}
const params = Promise.resolve({ id: 'grd_inherited' });

beforeEach(async () => {
  db.__reset();
  // Buyer holds the block now; the guardian row still carries the seller's key.
  chainOwner = { [BLOCK]: BUYER.address };
  await db.guardianAgent.create({
    data: {
      id: 'grd_inherited', blockHeight: BLOCK, status: 'active', ownerAddress: SELLER.address,
      name: 'Inherited', soulMd: 'x', llmProvider: 'openai', llmModel: 'gpt-x',
      llmApiKey: 'enc(sk-SELLER-SECRET)', llmEndpoint: null,
    },
  });
});

const storedKey = async () => (await db.guardianAgent.findUnique({ where: { id: 'grd_inherited' } })).llmApiKey;

describe('bg56 Q-14: inherited guardian key cannot be redirected', () => {
  it('clears the stored key when the live owner repoints llmEndpoint without a fresh key', async () => {
    const res: any = await PATCH(patchReq(BUYER, { llmEndpoint: 'https://attacker.example/v1' }), { params });
    expect(res.status).toBe(200);
    expect(await storedKey()).toBeNull();
  });

  it('clears the stored key when the provider changes without a fresh key', async () => {
    const res: any = await PATCH(patchReq(BUYER, { llmProvider: 'anthropic' }), { params });
    expect(res.status).toBe(200);
    expect(await storedKey()).toBeNull();
  });

  it('keeps a freshly-supplied key when the endpoint changes', async () => {
    const res: any = await PATCH(
      patchReq(BUYER, { llmEndpoint: 'https://buyer.example/v1', llmApiKey: 'sk-BUYER-OWN' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(await storedKey()).toBe('enc(sk-BUYER-OWN)');
  });

  it('leaves the key untouched when the destination is unchanged (e.g. editing the name)', async () => {
    const res: any = await PATCH(patchReq(BUYER, { name: 'Renamed' }), { params });
    expect(res.status).toBe(200);
    expect(await storedKey()).toBe('enc(sk-SELLER-SECRET)');
  });
});

// bg58: the create/update upsert must apply the same rule, or POST is the way around PATCH.
describe('bg58: POST /guardian upsert cannot redirect a stored key either', () => {
  const OWNER = makeWallet('p2tr');
  const postReq = (body: Record<string, unknown>) => {
    const message = `guardian-config:${BLOCK}:${OWNER.address}:${Date.now()}`;
    const signature = sign(OWNER.privKey, OWNER.address, message);
    return {
      json: async () => ({ blockHeight: BLOCK, ownerAddress: OWNER.address, name: 'Mine', signature, message, ...body }),
    } as any;
  };
  const ownKey = async () =>
    (await db.guardianAgent.findUnique({ where: { blockHeight_ownerAddress: { blockHeight: BLOCK, ownerAddress: OWNER.address } } }))
      .llmApiKey;

  beforeEach(async () => {
    chainOwner = { [BLOCK]: OWNER.address };
    await db.guardianAgent.create({
      data: {
        blockHeight: BLOCK, ownerAddress: OWNER.address, status: 'active', name: 'Mine', soulMd: 'x',
        llmProvider: 'openai', llmModel: 'gpt-x', llmApiKey: 'enc(sk-OWNER)', llmEndpoint: null,
      },
    });
  });

  it('clears the stored key when POST repoints llmEndpoint without a fresh key', async () => {
    const res: any = await POST(postReq({ llmEndpoint: 'https://attacker.example/v1' }));
    expect(res.status).toBe(200);
    expect(await ownKey()).toBeNull();
  });

  it('keeps the key when POST re-sends the same destination', async () => {
    const res: any = await POST(postReq({ llmProvider: 'openai', llmEndpoint: null }));
    expect(res.status).toBe(200);
    expect(await ownKey()).toBe('enc(sk-OWNER)');
  });

  it('stores a fresh key sent alongside a new endpoint', async () => {
    const res: any = await POST(postReq({ llmEndpoint: 'https://mine.example/v1', llmApiKey: 'sk-NEW' }));
    expect(res.status).toBe(200);
    expect(await ownKey()).toBe('enc(sk-NEW)');
  });
});
