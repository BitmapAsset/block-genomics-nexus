/**
 * ISOLATED SIMULATION — live on-chain re-verify at agent register (OPEN-2).
 *
 * Proves the lag-window fix: between an on-chain sale and the next ownership-sync
 * cron, the FORMER owner's stale DB record must NOT authorize registration.
 * Also proves the outage fallback (indeterminate → DB snapshot, never fail-open).
 */

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
import * as ord from '@/lib/onchain/ord';
import { issueChallenge } from '@/lib/challenges';
import { POST as registerPOST } from '@/app/api/v1/agents/register/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const getOwner = ord.getInscriptionOwner as jest.Mock;
// ord.getInscriptionOwner resolves { address, satpoint } | null — NOT a bare string.
const onChain = (address: string) => ({ address, satpoint: `${address}:0` });

const req = (body: any) => ({ json: async () => body, url: 'http://test.local/', nextUrl: new URL('http://test.local/') } as any);

async function issue(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return challengeMessage(nonce);
}

async function registerAs(wallet: { wif: string; address: string }, blockHeight: number) {
  const message = await issue(wallet.address, 'agent-register');
  const signature = sign(wallet.wif, wallet.address, message);
  return registerPOST(
    req({
      walletAddress: wallet.address, endpointUrl: 'https://agent.example', blockHeight,
      tier: 1, permissions: ['READ_DMS'], signature, challenge: message,
    }),
  );
}

beforeEach(() => {
  db.__reset();
  getOwner.mockReset();
  getOwner.mockResolvedValue(null); // default: indeterminate
});

describe('SIM: live on-chain re-verify at register (OPEN-2)', () => {
  it('FAILS CLOSED: a former owner cannot register in the sale→cron lag window', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    // DB is STALE: still shows the seller as owner; inscription is linked.
    await db.block.create({ data: { height: 2001, ownerAddress: seller.address, inscriptionId: 'insc-2001' } });
    await db.user.create({ data: { walletAddress: seller.address, verified: true, tier: 1, anchorBlock: 2001, ownedBlocks: [], genomeHash: 'gh' } });
    // On-chain truth: the buyer owns it now.
    getOwner.mockResolvedValue(onChain(buyer.address));

    const res = await registerAs(seller, 2001);
    expect(res.status).toBe(403); // live mismatch beats the stale DB snapshot
    expect(await db.bitmapAgent.count({ where: { blockHeight: 2001 } })).toBe(0);
  });

  it('the true on-chain owner (buyer) can register — and the DB is synced', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 2002, ownerAddress: seller.address, inscriptionId: 'insc-2002' } });
    getOwner.mockResolvedValue(onChain(buyer.address));

    const res = await registerAs(buyer, 2002);
    expect(res.status).toBe(201);
    // verifyAndSyncBlock flipped the block to the buyer on the way through.
    expect((await db.block.findUnique({ where: { height: 2002 } })).ownerAddress).toBe(buyer.address);
  });

  it('indexer OUTAGE → falls back to DB snapshot (legit owner allowed, non-owner denied)', async () => {
    const owner = makeWallet('p2tr');
    const stranger = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 2003, ownerAddress: owner.address, inscriptionId: 'insc-2003' } });
    getOwner.mockResolvedValue(null); // outage → indeterminate

    expect((await registerAs(owner, 2003)).status).toBe(201); // snapshot says owner → allowed
    // cooldown is per-wallet; stranger is a different wallet.
    expect((await registerAs(stranger, 2003)).status).toBe(403); // snapshot denies non-owner
  });

  it('no inscription linked → indeterminate → DB snapshot governs (legacy behavior preserved)', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 2004, ownerAddress: owner.address } }); // no inscriptionId
    // getOwner should not even matter; leave default null.
    expect((await registerAs(owner, 2004)).status).toBe(201);
  });
});
