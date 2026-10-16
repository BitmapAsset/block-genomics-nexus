/**
 * SIMULATION — `POST /delegations/listings` authorizes an update against the
 * listing's OWN block (bg48 Q-04).
 *
 * Ownership was checked on `body.blockHeight` while the upsert edited
 * `body.listingId`, and listing ids are public (`GET /delegations/listings`).
 * So the owner of any block A posted `{ blockHeight: A, listingId: <listing on
 * B> }`, signed with their own wallet, and re-priced and re-activated B's
 * listing — including listings the sale release had deactivated.
 */

const BLOCK_A = 840000;
const BLOCK_B = 700000;

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

jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) =>
    chainOwner[height] === wallet
      ? { verified: true, inscriptionId: `insc_${height}` }
      : { verified: false, reason: 'not held by this wallet' },
}));

import prisma from '@/lib/prisma';
import { POST as LIST } from '@/app/api/v1/delegations/listings/route';
import { makeWallet, sign } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const ATTACKER = makeWallet('p2tr'); // owns block A
const VICTIM = makeWallet('p2tr'); // owns block B

function signedReq(wallet: { privKey: string; address: string }, body: Record<string, unknown>) {
  const message = `list:${Date.now()}`;
  return {
    json: async () => ({ ...body, walletAddress: wallet.address, message, signature: sign(wallet.privKey, wallet.address, message) }),
  } as never;
}

const victimListing = () => db.delegationListing.findUnique({ where: { id: 'lst_b' } });

beforeEach(async () => {
  db.__reset();
  chainOwner = { [BLOCK_A]: ATTACKER.address, [BLOCK_B]: VICTIM.address };
  // Deactivated by the sale release; ids are public in GET.
  await db.delegationListing.create({
    data: { id: 'lst_b', blockHeight: BLOCK_B, ownerAddress: VICTIM.address, tier: 2, spotsTotal: -1, price30d: 1000, price365d: 9000, active: false },
  });
});

describe('a listing is edited only under its own block', () => {
  it("refuses an owner of block A editing block B's listing via body.blockHeight = A (400), unchanged", async () => {
    const res: any = await LIST(signedReq(ATTACKER, { blockHeight: BLOCK_A, listingId: 'lst_b', tier: 3, price30d: 1, price365d: 1 }));

    expect(res.status).toBe(400);
    const row = await victimListing();
    expect(row.price30d).toBe(1000);
    expect(row.active).toBe(false);
  });

  it("refuses the same edit when it names block B honestly, because the caller doesn't hold B (403)", async () => {
    const res: any = await LIST(signedReq(ATTACKER, { blockHeight: BLOCK_B, listingId: 'lst_b', tier: 3, price30d: 1, price365d: 1 }));

    expect(res.status).toBe(403);
    expect((await victimListing()).price30d).toBe(1000);
  });

  it('an unknown listingId is a 404, not a silently created listing', async () => {
    const res: any = await LIST(signedReq(ATTACKER, { blockHeight: BLOCK_A, listingId: 'lst_nope', tier: 3, price30d: 5, price365d: 50 }));

    expect(res.status).toBe(404);
    expect(db.__rows('delegationListing')).toHaveLength(1);
  });

  it("the live holder of B updates B's listing", async () => {
    const res: any = await LIST(signedReq(VICTIM, { blockHeight: BLOCK_B, listingId: 'lst_b', tier: 3, price30d: 2000, price365d: 20000 }));

    expect(res.status).toBe(200);
    const row = await victimListing();
    expect(row.price30d).toBe(2000);
    expect(row.tier).toBe(3);
  });

  it('creating a new listing on an owned block still works', async () => {
    const res: any = await LIST(signedReq(ATTACKER, { blockHeight: BLOCK_A, tier: 3, price30d: 100, price365d: 1000 }));

    expect(res.status).toBe(200);
    const created = db.__rows('delegationListing').filter((l: any) => l.blockHeight === BLOCK_A);
    expect(created).toHaveLength(1);
    expect(created[0].ownerAddress).toBe(ATTACKER.address);
  });
});
