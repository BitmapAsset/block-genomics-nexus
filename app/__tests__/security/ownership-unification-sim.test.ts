/**
 * SIMULATION — one ownership implementation, and it fails closed.
 *
 * #124 made authorization ask the chain at decision time and return a retryable
 * 503 when no indexer could answer. #138 closed the last route that authorized
 * from `Block.ownerAddress`. Both left the same shape behind in other places:
 * a SECOND way to answer "does this wallet own this block?", and the second way
 * was the lenient one.
 *
 * Two distinct shapes, both provable here:
 *
 *   LENIENT FALLBACK — experience writes and agent registration DID re-verify
 *     live, then treated an INDETERMINATE result (indexer outage, or no
 *     inscription linked in our own DB) as permission to fall back to the DB
 *     snapshot. The gate returns 503 in exactly that situation. So an attacker
 *     who can make the indexer unreachable — or who simply picks a block whose
 *     `inscriptionId` we never recorded — converts "the chain is unreachable"
 *     into a write. A stale snapshot naming the seller is the grant.
 *
 *   CACHE-ONLY — livestream, prep-transfer, profile create, delegation listings
 *     and parcel customize never asked the chain at all. `Block.ownerAddress`
 *     alone authorized, so the entire attack window between an on-chain sale
 *     and the next background sync was a grant to the seller.
 *
 * These drive the REAL routes and the REAL primitives. Only the seams are
 * mocked: the database (in-memory) and the indexer — where moving `chainOwner`
 * IS the transfer, with no time passing, because "the cache has not caught up
 * yet" is the whole attack window.
 */

const SELLER = 'bc1pseller00000000000000000000000000000000000';
const BUYER = 'bc1pbuyer000000000000000000000000000000000000';
const BLOCK = 840000;

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

// THE indexer. Every ownership answer in the app must come through here.
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'indexer down' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true, inscriptionId: 'insc_i0' };
    return { verified: false, reason: `No .bitmap inscription for block ${height} is held by this wallet` };
  },
}));

// The freshness layer sits under `ownership-sync`; the same outage switch drives
// it, so a test cannot accidentally leave one path live while the other is down.
jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: async () => (indexerDown ? null : { address: chainOwner }),
  resolveInscriptionOwnerAddress: async () => (indexerDown ? null : chainOwner),
  invalidateInscriptionOwner: () => {},
}));

jest.mock('@/lib/onchain/ord', () => ({
  getStatus: async () => (indexerDown ? null : { height: 900000 }),
  getAddressInscriptions: async () => (indexerDown ? null : []),
}));

// Signatures are proven elsewhere; here every signature is valid so that a case
// can only pass or fail on the ownership decision.
jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return { ...actual, verifyWalletSignature: () => true };
});

jest.mock('@/lib/agent-protocol', () => {
  const actual = jest.requireActual('@/lib/agent-protocol');
  return { ...actual, verifyAgentSignature: () => true };
});

// Action binding has its own suite (and its own failure modes); binding always
// succeeds here so a denial can only be an ownership denial.
jest.mock('@/lib/action-message', () => {
  const actual = jest.requireActual('@/lib/action-message');
  return { ...actual, verifyActionBinding: () => ({ ok: true, nonce: 'nonce-1' }) };
});

// Challenges have their own replay suite; consume always succeeds so a denial
// here is an ownership denial.
jest.mock('@/lib/challenges', () => ({
  consumeChallenge: async () => true,
  consumeChallengeFromMessage: async () => true,
  createChallenge: async () => 'challenge-text',
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  ESTATE_WRITE_LIMIT: 20,
  EXPERIENCE_WRITE_LIMIT: 20,
  PUBLIC_READ_LIMIT: 120,
}));

import prisma from '@/lib/prisma';
import { verifyLiveBlockOwnership } from '@/lib/experience-ownership';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** The cache the background sync keeps — deliberately stale, naming the seller. */
function seedStaleCache(opts: { inscriptionId?: string | null } = {}) {
  db.__reset();
  db.__rows('block').push({
    height: BLOCK,
    ownerAddress: SELLER,
    inscriptionId: opts.inscriptionId === undefined ? 'insc_i0' : opts.inscriptionId,
  });
  db.__rows('user').push({
    walletAddress: SELLER,
    verified: true,
    anchorBlock: BLOCK,
    ownedBlocks: [BLOCK],
  });
}

function jsonReq(body: unknown) {
  return {
    json: async () => body,
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams() },
  };
}

beforeEach(() => {
  chainOwner = SELLER;
  indexerDown = false;
  seedStaleCache();
});

describe('an indexer outage is never a grant', () => {
  it('denies the experience/agent ownership primitive when no indexer can answer', async () => {
    // The seller still owns it on-chain AND in cache — but nothing can confirm
    // that right now. The gate's answer to this is 503, so this must be 503.
    indexerDown = true;

    const res = await verifyLiveBlockOwnership(SELLER, BLOCK);

    expect(res.ok).toBe(false);
    expect((res as { status: number }).status).toBe(503);
  });

  it('denies a SOLD block when the outage hides the sale', async () => {
    // The sale happened. The cache has not caught up. The indexer is unreachable.
    // Falling back to the snapshot here hands the seller a write on sold land.
    chainOwner = BUYER;
    indexerDown = true;

    const res = await verifyLiveBlockOwnership(SELLER, BLOCK);

    expect(res.ok).toBe(false);
    expect((res as { status: number }).status).toBe(503);
  });

  it('does not let a block with no linked inscription skip the chain', async () => {
    // `verifyBlockOwnership` reports INDETERMINATE when our own DB has no
    // inscriptionId — no outage required. The snapshot fallback made that a
    // grant, so an attacker picked such a block rather than attacking anything.
    seedStaleCache({ inscriptionId: null });
    chainOwner = BUYER;

    const res = await verifyLiveBlockOwnership(SELLER, BLOCK);

    expect(res.ok).toBe(false);
    expect((res as { status: number }).status).not.toBe(200);
  });

  it('still grants the live holder when the chain can answer', async () => {
    chainOwner = BUYER;

    await expect(verifyLiveBlockOwnership(BUYER, BLOCK)).resolves.toEqual({ ok: true });
  });
});

describe('a stale cache does not authorize a write', () => {
  // The sale is on-chain; `Block.ownerAddress` still names the seller. Every one
  // of these routes granted on that cache alone.
  beforeEach(() => {
    chainOwner = BUYER;
  });

  it('livestream: the seller cannot start a stream on sold land', async () => {
    const { POST } = await import('@/app/api/v1/livestream/route');
    const res = await POST(
      jsonReq({
        blockHeight: BLOCK,
        streamUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        walletAddress: SELLER,
        signature: 'sig',
        message: 'msg',
      }) as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('prep-transfer: the seller cannot wipe guardians on sold land', async () => {
    db.__rows('guardianAgent').push({
      id: 'g1',
      blockHeight: BLOCK,
      ownerAddress: SELLER,
      memoryMd: 'buyer memories',
      totalMessages: 7,
    });

    const { POST } = await import('@/app/api/v1/ownership/prep-transfer/route');
    const res = await POST(
      jsonReq({
        blockHeight: BLOCK,
        walletAddress: SELLER,
        signature: 'sig',
        message: 'msg',
        wipeOption: 'full',
      }) as never,
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    // and the destructive side effect must not have happened
    expect(db.__rows('guardianAgent')[0].memoryMd).toBe('buyer memories');
  });

  it('profiles/create: the seller cannot claim a handle on sold land', async () => {
    const { POST } = await import('@/app/api/v1/profiles/create/route');
    const res = await POST(
      jsonReq({
        blockHeight: BLOCK,
        walletAddress: SELLER,
        signature: 'sig',
        message: 'msg',
        handle: 'sellerhandle',
      }) as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('parcel customize: the seller cannot claim a new parcel on sold land', async () => {
    // Payload binding is a real check with its own suite, so the message is built
    // with the production helpers — otherwise this case would "pass" on a 400
    // from the binding and prove nothing about ownership.
    const crypto = await import('crypto');
    const { parcelCustomizeBindingString, parcelCustomizeBindingLine } = await import('@/lib/parcel-customize');
    const TX = 4;
    const fields = { customColor: '#ff0000' };
    const bindingHash = crypto
      .createHash('sha256')
      .update(parcelCustomizeBindingString(BLOCK, TX, fields))
      .digest('hex');
    const message = parcelCustomizeBindingLine(bindingHash, BLOCK, TX);

    const { POST } = await import('@/app/api/v1/blocks/[height]/parcels/[txIndex]/customize/route');
    const res = await POST(
      jsonReq({ walletAddress: SELLER, signature: 'sig', message, ...fields }) as never,
      { params: Promise.resolve({ height: String(BLOCK), txIndex: String(TX) }) },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(400); // not the binding check — the ownership check
    expect(db.__rows('parcel')).toHaveLength(0);
  });

  it('delegations/listings: the seller cannot rent out sold land', async () => {
    const { POST } = await import('@/app/api/v1/delegations/listings/route');
    const res = await POST(
      jsonReq({
        walletAddress: SELLER,
        signature: 'sig',
        message: 'msg',
        blockHeight: BLOCK,
        tier: 2,
        price30d: 1000,
        price365d: 9000,
      }) as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
