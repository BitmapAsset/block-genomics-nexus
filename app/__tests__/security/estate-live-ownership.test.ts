/**
 * SIMULATION — `POST /api/v1/estates` decides on the chain, not on our cache.
 *
 * The estates route was the last mutating surface still authorizing from
 * `Block.ownerAddress`, behind a bare BIP-322 signature that was never bound to
 * the action and never consumed. Two consequences, both provable here:
 *
 *   STALE OWNER — between an on-chain sale and the next background sync the
 *                 cache still names the seller. The seller could keep naming
 *                 estates on land they had sold, and the buyer was refused on
 *                 land they had just bought.
 *   REPLAY      — the signature proved a wallet, once, over any message at all.
 *                 Nothing stopped it being re-sent.
 *
 * These drive the REAL route through the REAL ownership gate and REAL session
 * minting. Only the seams are mocked: the database (in-memory) and the indexer
 * — where moving `chainOwner` IS the transfer, with no time passing, because
 * "the cache has not caught up yet" is the whole attack window.
 *
 * The round-trip cases are here rather than in their own file for the same
 * reason: an estate that authorizes correctly but never lands is not a fix, and
 * persistence was blocked on this gate (`Estate` carries required foreign keys
 * to `User` and `Block`, which a chain-proven wallet need not have).
 */

const SELLER = 'bc1pseller00000000000000000000000000000000000';
const BUYER = 'bc1pbuyer000000000000000000000000000000000000';
const STRANGER = 'bc1pstranger00000000000000000000000000000000';
const BLOCK = 840000;
const OTHER_BLOCK = 700000;

let chainOwner: string = SELLER;
let indexerDown = false;

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
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'indexer down' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true, inscriptionId: 'insc_i0' };
    return { verified: false, reason: `No .bitmap inscription for block ${height} is held by this wallet` };
  },
}));

// The limiter has its own suite; a pass-through here so it is never the reason
// a case passes or fails.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  ESTATE_WRITE_LIMIT: 20,
  PUBLIC_READ_LIMIT: 120,
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as CREATE } from '@/app/api/v1/estates/route';
import { GET as LIST } from '@/app/api/v1/estates/[blockHeight]/route';
import { makeWallet, sign, challengeMessage, freshNonce } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const estateBody = (over: Record<string, unknown> = {}) => ({
  name: 'Central Citadel',
  blockHeight: BLOCK,
  parcelIndices: [3, 1, 2],
  glowColor: '#00ffff',
  ...over,
});

/** A request carrying a `bg_vfy_` session token — the only credential accepted. */
function tokenReq(token: string | null, body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
  } as never;
}

/** The credential the route USED to accept: a wallet address plus a raw signature. */
function legacySignedReq(wallet: { privKey: string; address: string }, body: Record<string, unknown>) {
  const message = challengeMessage(freshNonce());
  return {
    json: async () => ({
      ...body,
      walletAddress: wallet.address,
      message,
      signature: sign(wallet.privKey, wallet.address, message),
    }),
    headers: { get: () => null },
  } as never;
}

function listReq(blockHeight: number) {
  return [
    { headers: { get: () => null }, nextUrl: new URL(`http://test.local/api/v1/estates/${blockHeight}`) },
    { params: Promise.resolve({ blockHeight: String(blockHeight) }) },
  ] as never[];
}

async function session(wallet: string, blocks: number[]): Promise<string> {
  const { token } = await mintVerifiedSession(wallet, blocks);
  return token;
}

const estateCount = async () => db.estate.count({});

beforeEach(() => {
  db.__reset();
  chainOwner = SELLER;
  indexerDown = false;
  jest.clearAllMocks();
});

// ── 1. The stale-cache window ────────────────────────────────────────────
describe('a sale is honoured on the very next estate write', () => {
  /** The cache the old route trusted: it names the seller, and stays wrong. */
  async function seedPreSaleCache() {
    await db.block.create({
      data: { height: BLOCK, ownerAddress: SELLER, inscriptionId: 'insc_i0' },
    });
    await db.user.create({ data: { walletAddress: SELLER } });
  }

  it('refuses the seller while the cache still names them the owner', async () => {
    await seedPreSaleCache();
    const sellerToken = await session(SELLER, [BLOCK]); // proved BEFORE the sale
    chainOwner = BUYER; // the sale lands on-chain; no time passes

    const res: any = await CREATE(tokenReq(sellerToken, estateBody()));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ownership_lost');
    // The cache is untouched and still wrong — the refusal came from the chain.
    expect((await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress).toBe(SELLER);
    expect(await estateCount()).toBe(0);
  });

  it('allows the buyer on the block they just bought, cache notwithstanding', async () => {
    await seedPreSaleCache();
    chainOwner = BUYER;
    const buyerToken = await session(BUYER, [BLOCK]);

    const res: any = await CREATE(tokenReq(buyerToken, estateBody()));

    expect(res.status).toBe(201);
    expect(await estateCount()).toBe(1);
    expect((await db.estate.findFirst({})).ownerAddress).toBe(BUYER);
  });

  it('flips authority again on a resale back, with no time passing', async () => {
    await seedPreSaleCache();
    const sellerToken = await session(SELLER, [BLOCK]);
    const buyerToken = await session(BUYER, [BLOCK]);

    chainOwner = BUYER;
    expect((await CREATE(tokenReq(sellerToken, estateBody())) as any).status).toBe(403);
    expect((await CREATE(tokenReq(buyerToken, estateBody())) as any).status).toBe(201);

    chainOwner = SELLER;
    expect((await CREATE(tokenReq(buyerToken, estateBody({ name: 'Second' }))) as any).status).toBe(403);
    expect((await CREATE(tokenReq(sellerToken, estateBody({ name: 'Third' }))) as any).status).toBe(201);

    expect(await estateCount()).toBe(2);
  });

  it('refuses a wallet the cache never named either — no row, no grant', async () => {
    const strangerToken = await session(STRANGER, [BLOCK]);
    const res: any = await CREATE(tokenReq(strangerToken, estateBody()));
    expect(res.status).toBe(403);
    expect(await estateCount()).toBe(0);
  });
});

// ── 2. The credential itself ─────────────────────────────────────────────
describe('the credential must be a live, scoped session', () => {
  it('refuses a bare wallet signature backed by a stale cache — the old grant', async () => {
    // This is the vulnerability itself, driven through the door it came in by.
    // A real BIP-322 signature from a wallet the CACHE still calls the owner,
    // for a block the CHAIN says was sold. The old route checked the signature,
    // read `Block.ownerAddress`, and returned 201. The signature was also never
    // action-bound nor consumed, so it could be re-sent forever.
    const seller = makeWallet('p2tr');
    await db.block.create({ data: { height: BLOCK, ownerAddress: seller.address } });
    await db.user.create({ data: { walletAddress: seller.address } });
    chainOwner = BUYER; // sold; the cache has not caught up

    const res: any = await CREATE(legacySignedReq(seller, estateBody()));

    expect(res.status).toBe(401);
    expect((await res.json()).verify.steps.length).toBeGreaterThan(0);
    expect(await estateCount()).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res: any = await CREATE(tokenReq(null, estateBody()));
    expect(res.status).toBe(401);
    expect(await estateCount()).toBe(0);
  });

  it('refuses a session scoped to a different block', async () => {
    chainOwner = BUYER;
    const token = await session(BUYER, [OTHER_BLOCK]);
    const res: any = await CREATE(tokenReq(token, estateBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('out_of_scope');
    expect(await estateCount()).toBe(0);
  });

  it('treats an indexer outage as retryable, never as a grant', async () => {
    const token = await session(SELLER, [BLOCK]);
    indexerDown = true;
    const res: any = await CREATE(tokenReq(token, estateBody()));
    expect(res.status).toBe(503);
    expect(await estateCount()).toBe(0);
  });

  it('attributes the estate to the session wallet, never to the request body', async () => {
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);
    const res: any = await CREATE(tokenReq(token, estateBody({ ownerAddress: STRANGER, walletAddress: STRANGER })));
    expect(res.status).toBe(201);
    expect((await db.estate.findFirst({})).ownerAddress).toBe(BUYER);
  });
});

// ── 3. It actually lands ─────────────────────────────────────────────────
describe('an authorized estate round-trips', () => {
  it('creates the owner and block rows a chain-proven wallet may not have', async () => {
    // Nothing seeded: this wallet has proved ownership on-chain and has never
    // touched our database. Estate carries required FKs to both.
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);

    const res: any = await CREATE(tokenReq(token, estateBody()));

    expect(res.status).toBe(201);
    expect(await db.user.findUnique({ where: { walletAddress: BUYER } })).not.toBeNull();
    expect((await db.block.findUnique({ where: { height: BLOCK } })).ownerAddress).toBe(BUYER);
  });

  it('reloads from the list route with the same owner and parcels', async () => {
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);
    const created: any = await CREATE(tokenReq(token, estateBody()));
    const id = (await created.json()).data.id;

    const listed: any = await LIST(...(listReq(BLOCK) as [never, never]));
    const rows = (await listed.json()).data;

    expect(listed.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].ownerAddress).toBe(BUYER);
    expect(rows[0].name).toBe('Central Citadel');
    // Stored as a JSON string, handed back as numbers, de-duplicated and sorted.
    expect(rows[0].parcelIndices).toEqual([1, 2, 3]);
  });

  it('does not leak an estate onto a neighbouring block', async () => {
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);
    await CREATE(tokenReq(token, estateBody()));

    const listed: any = await LIST(...(listReq(OTHER_BLOCK) as [never, never]));
    expect((await listed.json()).data).toEqual([]);
  });

  it('rejects a body that names no usable parcel before spending an indexer call', async () => {
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);
    const res: any = await CREATE(tokenReq(token, estateBody({ parcelIndices: ['x', -1] })));
    expect(res.status).toBe(400);
    expect(await estateCount()).toBe(0);
  });
});
