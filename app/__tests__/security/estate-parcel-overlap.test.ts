/**
 * SIMULATION — two estates cannot claim the same parcel, and a sale does not
 * leave the seller's estate standing on the buyer's land.
 *
 * `POST /api/v1/estates` validated that parcel indices were integers and never
 * that they were FREE. Nothing else did either: `Estate.parcelIndices` is a JSON
 * string column, so the database cannot express the constraint, and the gate
 * only answers who owns the block.
 *
 * Two estates claiming parcel 7 is not a display quirk. The viewer builds a
 * parcel → estate map by iterating estates and calling `map.set(idx, estate)`,
 * so the winner is whichever estate the API happened to return last — a value
 * that can change between two loads of the same block with no data change at
 * all. One of the two owners is being shown someone else's name on their land,
 * and which one is arbitrary.
 *
 * It takes a sale to reach the state at all: `@@unique([blockHeight,
 * ownerAddress])` means one estate per owner per block, so two estates on one
 * block implies two different owners, which implies the block changed hands.
 * That points at the root cause — `processOwnershipTransfer` releases the
 * seller's profile, guardian, agents, and experiences on sale, but left their
 * estates behind.
 */

const SELLER = 'bc1pseller00000000000000000000000000000000000';
const BUYER = 'bc1pbuyer000000000000000000000000000000000000';
const BLOCK = 840000;

let chainOwner: string = SELLER;

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

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) =>
    wallet === chainOwner && height === BLOCK
      ? { verified: true, inscriptionId: 'insc_i0' }
      : { verified: false, reason: 'not held by this wallet' },
}));

// The reconciliation cron reads the chain through this layer.
jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: async () => ({ address: chainOwner }),
  resolveInscriptionOwnerAddress: async () => chainOwner,
  invalidateInscriptionOwner: () => {},
}));

jest.mock('@/lib/onchain/ord', () => ({
  getStatus: async () => ({ height: 900000 }),
  getAddressInscriptions: async () => [],
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  ESTATE_WRITE_LIMIT: 20,
  PUBLIC_READ_LIMIT: 120,
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as CREATE } from '@/app/api/v1/estates/route';
import { processOwnershipTransfer, batchVerifyOwnership } from '@/lib/ownership-sync';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

function tokenReq(token: string, body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  } as never;
}

async function createEstate(wallet: string, body: Record<string, unknown>) {
  const { token } = await mintVerifiedSession(wallet, [BLOCK]);
  return CREATE(tokenReq(token, { name: 'Estate', blockHeight: BLOCK, ...body })) as any;
}

beforeEach(async () => {
  db.__reset();
  chainOwner = SELLER;
  await db.block.create({ data: { height: BLOCK, ownerAddress: SELLER, inscriptionId: 'insc_i0' } });
});

describe('a parcel belongs to at most one estate', () => {
  it('rejects a create that overlaps an existing estate, and names the conflict', async () => {
    const first = await createEstate(SELLER, { name: 'Citadel', parcelIndices: [1, 2, 3] });
    expect(first.status).toBe(201);

    // The block sells, so the buyer is now the only wallet that can write here.
    chainOwner = BUYER;
    const clash = await createEstate(BUYER, { name: 'Buyer Keep', parcelIndices: [3, 4, 5] });

    expect(clash.status).toBe(409);
    expect(JSON.stringify(clash.body)).toMatch(/3/); // says WHICH parcel
    expect(await db.estate.count({})).toBe(1);
  });

  it('allows a create that touches no claimed parcel', async () => {
    await createEstate(SELLER, { name: 'Citadel', parcelIndices: [1, 2, 3] });
    chainOwner = BUYER;

    const ok = await createEstate(BUYER, { name: 'Buyer Keep', parcelIndices: [4, 5] });

    expect(ok.status).toBe(201);
    expect(await db.estate.count({})).toBe(2);
  });
});

describe('a sale releases the seller’s estates', () => {
  it('does not leave the seller named on land they sold', async () => {
    const created = await createEstate(SELLER, { name: 'Citadel', parcelIndices: [1, 2, 3] });
    expect(created.status).toBe(201);

    await processOwnershipTransfer(BLOCK, BUYER, 'insc_i0');

    // Same rule the seller's profile, guardian, agents and experiences follow: a
    // sale is a blank slate, and an estate is the seller naming the buyer's land.
    expect(await db.estate.count({ where: { ownerAddress: SELLER } })).toBe(0);
  });

  it('leaves the buyer free to claim the parcels the seller had named', async () => {
    await createEstate(SELLER, { name: 'Citadel', parcelIndices: [1, 2, 3] });
    await processOwnershipTransfer(BLOCK, BUYER, 'insc_i0');
    chainOwner = BUYER;

    // If the seller's estate survived the sale, this would 409 forever — the
    // buyer would be locked out of their own parcels by a previous owner.
    const res = await createEstate(BUYER, { name: 'Buyer Keep', parcelIndices: [1, 2, 3] });
    expect(res.status).toBe(201);
  });
});

describe('naming an estate does not suppress the blank-slate release', () => {
  it('leaves the stale cache for the cron to find, so the seller’s secrets still get wiped', async () => {
    await db.guardianAgent.create({
      data: {
        id: 'g1', blockHeight: BLOCK, ownerAddress: SELLER,
        name: 'Seller Guardian', llmApiKey: 'sk-SELLER-SECRET', status: 'active', soulMd: 'x',
      },
    });

    // The block sells, and the buyer's first act is to name their new land.
    chainOwner = BUYER;
    expect((await createEstate(BUYER, { name: 'Buyer Keep', parcelIndices: [1, 2] })).status).toBe(201);

    // The route used to write `ownerAddress` here as a "cache refresh from a
    // fact just verified live". That erased the very difference the cron looks
    // for: it would then see cached-owner == chain-owner, report a match, and
    // never run the release — leaving the seller's LLM key, guardian, profile
    // and experiences on the buyer's block permanently.
    expect((await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress).toBe(SELLER);

    await batchVerifyOwnership([BLOCK]);

    const guardian = await db.guardianAgent.findUnique({ where: { id: 'g1' } });
    expect(guardian.llmApiKey).toBeNull();
    expect(guardian.status).toBe('released');
    expect((await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress).toBe(BUYER);
  });
});
