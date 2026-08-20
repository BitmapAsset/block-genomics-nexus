/**
 * ISOLATED SIMULATION — live on-chain re-verify at agent register (OPEN-2).
 *
 * Proves the lag-window fix: between an on-chain sale and the next ownership-sync
 * cron, the FORMER owner's stale DB record must NOT authorize registration.
 *
 * This suite previously also asserted the OUTAGE FALLBACK — that an
 * indeterminate live result (indexer unreachable, or no `inscriptionId` linked
 * in our own DB) fell back to the `Block.ownerAddress` snapshot and granted.
 * That was the lenient second implementation of ownership, and it is gone: an
 * attacker who could make the indexer unreachable, or who simply picked a block
 * we had never linked an inscription for, converted "the chain cannot answer"
 * into a write, with the stale snapshot naming the seller as the grant. Those
 * cases now assert the gate's answer — a retryable 503.
 *
 * The seam is `verifyBlockOwnedBy`: the ONE question the whole app asks about
 * who holds a block right now.
 */

let chainOwner: string | null = null;
let indexerDown = false;

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: { set: () => {}, get: () => null },
    }),
  },
}));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    if (chainOwner && wallet === chainOwner) return { verified: true, inscriptionId: 'insc-live' };
    return { verified: false, reason: 'No .bitmap inscription for this block is held by this wallet' };
  },
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
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const req = (body: any) => ({ json: async () => body, url: 'http://test.local/', nextUrl: new URL('http://test.local/') } as any);

async function issue(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return challengeMessage(nonce);
}

async function registerAs(wallet: { privKey: string; address: string }, blockHeight: number) {
  const message = await issue(wallet.address, 'agent-register');
  const signature = sign(wallet.privKey, wallet.address, message);
  return registerPOST(
    req({
      walletAddress: wallet.address, endpointUrl: 'https://agent.example', blockHeight,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }),
  );
}

beforeEach(() => {
  db.__reset();
  chainOwner = null;
  indexerDown = false;
});

describe('SIM: live on-chain re-verify at register (OPEN-2)', () => {
  it('FAILS CLOSED: a former owner cannot register in the sale→cron lag window', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    // DB is STALE: still shows the seller as owner; inscription is linked.
    await db.block.create({ data: { height: 2001, ownerAddress: seller.address, inscriptionId: 'insc-2001' } });
    await db.user.create({ data: { walletAddress: seller.address, verified: true, tier: 1, anchorBlock: 2001, ownedBlocks: [], genomeHash: 'gh' } });
    // On-chain truth: the buyer owns it now.
    chainOwner = buyer.address;

    const res = await registerAs(seller, 2001);
    expect(res.status).toBe(403); // live mismatch beats the stale DB snapshot
    expect(await db.bitmapAgent.count({ where: { blockHeight: 2001 } })).toBe(0);
  });

  it('the true on-chain owner (buyer) can register even while the cache names the seller', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 2002, ownerAddress: seller.address, inscriptionId: 'insc-2002' } });
    chainOwner = buyer.address;

    const res = await registerAs(buyer, 2002);
    expect(res.status).toBe(201);

    // The route does NOT flip the cache. It used to, via `verifyAndSyncBlock`.
    // Leaving it stale is deliberate: `Block.ownerAddress` still naming the
    // seller is exactly the mismatch the ownership-sync cron looks for, and the
    // cron is what performs the blank-slate RELEASE of the seller's guardian,
    // secrets, and profile. A route that refreshed the cache without releasing
    // would make the cron see db-owner == chain-owner, report a match, and never
    // retry — stranding the seller's secrets on the buyer's land permanently.
    expect((await db.block.findUnique({ where: { height: 2002 } })).ownerAddress).toBe(seller.address);
  });

  it('indexer OUTAGE is a retryable 503 — never a grant off the snapshot', async () => {
    const owner = makeWallet('p2tr');
    const stranger = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 2003, ownerAddress: owner.address, inscriptionId: 'insc-2003' } });
    chainOwner = owner.address;
    indexerDown = true;

    // Even the legitimate owner waits. The alternative is a snapshot grant, and
    // the snapshot cannot tell a legitimate owner from a seller mid-sale.
    expect((await registerAs(owner, 2003)).status).toBe(503);
    expect((await registerAs(stranger, 2003)).status).toBe(503);
    expect(await db.bitmapAgent.count({ where: { blockHeight: 2003 } })).toBe(0);
  });

  it('no inscription linked in our DB does not fall back to the snapshot', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 2004, ownerAddress: owner.address } }); // no inscriptionId
    // The chain is reachable and does not name this wallet as a holder, so this
    // is a definitive negative — not an outage. Our own missing `inscriptionId`
    // used to make it INDETERMINATE, which the snapshot then answered with 201.
    chainOwner = null;

    expect((await registerAs(owner, 2004)).status).toBe(403);
    expect(await db.bitmapAgent.count({ where: { blockHeight: 2004 } })).toBe(0);
  });

  it('a live holder registers even when our DB has no inscription linked at all', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 2005, ownerAddress: owner.address } }); // no inscriptionId
    chainOwner = owner.address;

    // The wallet scan answers from the chain, so a gap in our cache neither
    // grants (previous behaviour) nor blocks a real owner.
    expect((await registerAs(owner, 2005)).status).toBe(201);
  });
});
