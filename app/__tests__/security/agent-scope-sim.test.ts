/**
 * ISOLATED SIMULATION — agent-doorway ownership scoping through the REAL routes,
 * backed by an in-memory Prisma and REAL BIP-322 signatures (no live chain, no DB).
 *
 * Covers the required scenarios:
 *   1. legit owner registers                       ✓
 *   3. replayed challenge rejected                 ✓
 *   4. expired challenge rejected                  ✓
 *   5. agent A cannot manage agent B               ✓  (+ replay of a manage challenge)
 *   6. ownership transfer revokes old agent power  ✓
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/onchain/ord', () => ({
  getInscriptionOwner: jest.fn(async () => null),
  getStatus: jest.fn(async () => ({ height: 800_000 })),
  getAddressInscriptions: jest.fn(async () => null),
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { POST as registerPOST } from '@/app/api/v1/agents/register/route';
import { PATCH as agentPATCH, DELETE as agentDELETE } from '@/app/api/v1/agents/[agentId]/route';
import { processOwnershipTransfer } from '@/lib/ownership-sync';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const req = (body: any, url = 'http://test.local/') =>
  ({ json: async () => body, url, nextUrl: new URL(url) } as any);
const ctx = (agentId: string) => ({ params: Promise.resolve({ agentId }) });

async function issue(address: string, purpose: string, ttlMs?: number): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose, ...(ttlMs !== undefined ? { ttlMs } : {}) });
  return challengeMessage(nonce);
}

beforeEach(() => db.__reset());

describe('SIM: agent-doorway ownership scoping (real routes + real signatures)', () => {
  it('Scenario 1 — the on-chain block owner can register an agent', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 111, ownerAddress: owner.address } });

    const message = await issue(owner.address, 'agent-register');
    const signature = sign(owner.wif, owner.address, message);

    const res = await registerPOST(req({
      walletAddress: owner.address, endpointUrl: 'https://agent.example', blockHeight: 111,
      tier: 1, permissions: ['READ_DMS', 'SEND_DMS'], signature, challenge: message,
    }));

    expect(res.status).toBe(201);
    expect(await db.bitmapAgent.count({ where: { blockHeight: 111 } })).toBe(1);
  });

  it('a non-owner cannot register on a block they do not own', async () => {
    const owner = makeWallet('p2tr');
    const stranger = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 112, ownerAddress: owner.address } });

    const message = await issue(stranger.address, 'agent-register');
    const signature = sign(stranger.wif, stranger.address, message);

    const res = await registerPOST(req({
      walletAddress: stranger.address, endpointUrl: 'https://evil.example', blockHeight: 112,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }));

    expect(res.status).toBe(403);
    expect(await db.bitmapAgent.count({ where: { blockHeight: 112 } })).toBe(0);
  });

  it('Scenario 3 — a replayed challenge is rejected on the second register', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 113, ownerAddress: owner.address } });

    const message = await issue(owner.address, 'agent-register');
    const signature = sign(owner.wif, owner.address, message);
    const body = {
      walletAddress: owner.address, endpointUrl: 'https://a.example', blockHeight: 113,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    };

    expect((await registerPOST(req(body))).status).toBe(201);
    // Same signed challenge again — nonce already consumed → 401 (not a dup 201).
    expect((await registerPOST(req(body))).status).toBe(401);
  });

  it('Scenario 4 — an expired challenge is rejected', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 114, ownerAddress: owner.address } });

    const message = await issue(owner.address, 'agent-register', -1000); // already expired
    const signature = sign(owner.wif, owner.address, message);

    const res = await registerPOST(req({
      walletAddress: owner.address, endpointUrl: 'https://a.example', blockHeight: 114,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }));

    expect(res.status).toBe(401);
  });

  it('a self-minted challenge (never issued by the server) is rejected', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 115, ownerAddress: owner.address } });

    const message = challengeMessage(freshNonce()); // valid signature, but never issued
    const signature = sign(owner.wif, owner.address, message);

    const res = await registerPOST(req({
      walletAddress: owner.address, endpointUrl: 'https://a.example', blockHeight: 115,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }));

    expect(res.status).toBe(401);
  });

  it('Scenario 5 — agent A cannot manage agent B (and a captured challenge cannot be replayed)', async () => {
    const a = makeWallet('p2tr');
    const b = makeWallet('p2wpkh');
    const agentB = await db.bitmapAgent.create({
      data: { walletAddress: b.address, endpointUrl: 'https://b.example', blockHeight: 222, tier: 1, permissions: JSON.stringify(['READ_DMS']), status: 'active' },
    });

    // A holds a perfectly valid signature over their OWN agent-manage challenge…
    const aMsg = await issue(a.address, 'agent-manage');
    const aSig = sign(a.wif, a.address, aMsg);
    const hijack = await agentPATCH(
      req({ walletAddress: a.address, signature: aSig, challenge: aMsg, endpointUrl: 'https://hijacked.example' }),
      ctx(agentB.id),
    );
    expect(hijack.status).toBe(403); // not B's owner
    expect((await db.bitmapAgent.findUnique({ where: { id: agentB.id } })).endpointUrl).toBe('https://b.example');

    // Positive control: B updates B with a fresh manage challenge.
    const bMsg = await issue(b.address, 'agent-manage');
    const bSig = sign(b.wif, b.address, bMsg);
    const ok = await agentPATCH(
      req({ walletAddress: b.address, signature: bSig, challenge: bMsg, endpointUrl: 'https://b2.example' }),
      ctx(agentB.id),
    );
    expect(ok.status).toBe(200);
    expect((await db.bitmapAgent.findUnique({ where: { id: agentB.id } })).endpointUrl).toBe('https://b2.example');

    // Replay B's now-consumed challenge → rejected.
    const replay = await agentPATCH(
      req({ walletAddress: b.address, signature: bSig, challenge: bMsg, endpointUrl: 'https://b3.example' }),
      ctx(agentB.id),
    );
    expect(replay.status).toBe(401);
    expect((await db.bitmapAgent.findUnique({ where: { id: agentB.id } })).endpointUrl).toBe('https://b2.example');
  });

  it('Scenario 6 — an ownership transfer revokes the former owner’s agent power', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 333, ownerAddress: seller.address, inscriptionId: 'insc333' } });
    await db.user.create({ data: { walletAddress: seller.address, verified: true, tier: 1, anchorBlock: 333, genomeHash: 'gh', ownedBlocks: [] } });
    const sellerAgent = await db.bitmapAgent.create({
      data: { walletAddress: seller.address, endpointUrl: 'https://s.example', blockHeight: 333, tier: 1, permissions: JSON.stringify(['FULL_AUTONOMY']), status: 'active' },
    });

    // Blockchain says the block moved to the buyer — run the REAL transfer.
    await processOwnershipTransfer(333, buyer.address, 'insc333');

    // The seller's agent row is gone, their anchor is cleared, block is the buyer's.
    expect(await db.bitmapAgent.findUnique({ where: { id: sellerAgent.id } })).toBeNull();
    expect((await db.user.findUnique({ where: { walletAddress: seller.address } })).anchorBlock).toBeNull();
    expect((await db.block.findUnique({ where: { height: 333 } })).ownerAddress).toBe(buyer.address);

    // And the seller can no longer register a new agent on the sold block.
    const message = await issue(seller.address, 'agent-register');
    const signature = sign(seller.wif, seller.address, message);
    const res = await registerPOST(req({
      walletAddress: seller.address, endpointUrl: 'https://s2.example', blockHeight: 333,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }));
    expect(res.status).toBe(403);
  });

  it('DELETE (revoke) is also ownership-scoped and challenge-gated', async () => {
    const a = makeWallet('p2tr');
    const b = makeWallet('p2wpkh');
    const agentB = await db.bitmapAgent.create({
      data: { walletAddress: b.address, endpointUrl: 'https://b.example', blockHeight: 444, tier: 1, permissions: JSON.stringify(['READ_DMS']), status: 'active' },
    });

    // A tries to revoke B → 403.
    const aMsg = await issue(a.address, 'agent-manage');
    const aSig = sign(a.wif, a.address, aMsg);
    const denied = await agentDELETE(req({ walletAddress: a.address, signature: aSig, challenge: aMsg }), ctx(agentB.id));
    expect(denied.status).toBe(403);
    expect((await db.bitmapAgent.findUnique({ where: { id: agentB.id } })).status).toBe('active');

    // B revokes B → 200, status flips to revoked.
    const bMsg = await issue(b.address, 'agent-manage');
    const bSig = sign(b.wif, b.address, bMsg);
    const ok = await agentDELETE(req({ walletAddress: b.address, signature: bSig, challenge: bMsg }), ctx(agentB.id));
    expect(ok.status).toBe(200);
    expect((await db.bitmapAgent.findUnique({ where: { id: agentB.id } })).status).toBe('revoked');
  });
});
