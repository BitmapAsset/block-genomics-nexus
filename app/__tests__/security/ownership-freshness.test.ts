/**
 * ISOLATED SIMULATION — authorization never decides on a cached owner.
 *
 * The gap this closes: owner lookups used to share one 5-minute memo, so a
 * display read could warm the cache and the very next AUTHORIZATION check would
 * be answered from it. Between an on-chain sale and that entry expiring, the
 * seller kept write authority over land they no longer owned — the protocol
 * promised "live at action time" and delivered "within 5 minutes of a sale".
 *
 * These tests pin the invariant from both ends:
 *   - the tier split itself (auth ignores the cache, display still uses it), and
 *   - the real /api/v1/experiences route, which is the path that WAS cache-served,
 *     driven with the cache deliberately warmed with the pre-sale owner.
 *
 * Both directions are covered (seller→buyer and a resale back), warm and cold,
 * because a one-directional fix would still strand a legitimate buyer.
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

jest.mock('@/lib/onchain/bitmap-ownership', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { verifyBlockOwnedByViaAuthFreshness } = require('../helpers/chain-ownership-mock');
  return verifyBlockOwnedByViaAuthFreshness();
});

jest.mock('@/lib/onchain/ord', () => ({
  getInscriptionOwner: jest.fn(async () => null),
  getStatus: jest.fn(async () => ({ height: 800_000 })),
  getAddressInscriptions: jest.fn(async () => null),
}));

// Both holder sources answer through mocks: the ord host and one Esplora host,
// so the real agreement rule decides (lib/onchain/holder-agreement.ts).
jest.mock('@/lib/onchain/sat-tracker', () => ({
  isSatTrackerEnabled: () => true,
  traceEachProvider: jest.fn(async () => []),
  forgetLocations: jest.fn(),
  // The base's single-provider call; it never names a holder here.
  trackInscriptionHolder: jest.fn(async () => ({ status: 'unknown', reason: 'no_provider' })),
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/experience-probe', () => ({
  __esModule: true,
  probeExperienceUrl: jest.fn(async () => ({ status: 'live', reachable: true, latencyMs: 120, httpStatus: 200 })),
}));

jest.mock('@/lib/experience-judge', () => ({
  __esModule: true,
  judgeExperienceManifest: jest.fn(async () => ({
    violated: false,
    ruleIndex: null,
    reasoning: 'clean',
    brainStatus: 'online',
  })),
}));

// The deed seam: the fixture row's inscriptionId is the chain's deed unless a case says otherwise.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/lib/onchain/deed', () => require('../helpers/chain-ownership-mock').canonicalDeedFromFixture({ seededRowIsDeed: true }));

import prisma from '@/lib/prisma';
import * as ord from '@/lib/onchain/ord';
import { traceEachProvider } from '@/lib/onchain/sat-tracker';
import { issueChallenge } from '@/lib/challenges';
import {
  resolveInscriptionOwner,
  invalidateInscriptionOwner,
  __resetOwnerObservations,
  DISPLAY_TTL_MS,
} from '@/lib/onchain/owner-freshness';
import { POST as registerPOST } from '@/app/api/v1/experiences/route';
import { GET as ownershipVerifyGET } from '@/app/api/v1/ownership/verify/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const getOwner = ord.getInscriptionOwner as jest.Mock;
const tracer = traceEachProvider as jest.Mock;
const SP = 'ab'.repeat(32) + ':0:0';
/** The chain names `address` (or nothing): the ord host and one Esplora host agree. */
function chainSays(address: string | null) {
  getOwner.mockResolvedValue(address === null ? null : { address, satpoint: SP, source: 'ord.test' });
  tracer.mockResolvedValue(
    address === null
      ? []
      : [{ source: 'esplora:esplora.test', host: 'https://esplora.test/api', state: 'ok', address, satpoint: SP }],
  );
}

const req = (body: any, url = 'http://test.local/') =>
  ({ json: async () => body, url, nextUrl: new URL(url) } as any);

async function issue(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return challengeMessage(nonce);
}

/** An authorization action on a block: register an experience on it. */
async function registerAs(wallet: { privKey: string; address: string }, blockHeight: number) {
  const message = await issue(wallet.address, 'experience-register');
  const signature = sign(wallet.privKey, wallet.address, message);
  return registerPOST(
    req({
      walletAddress: wallet.address,
      blockHeight,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      version: '1.0.0',
      signature,
      challenge: message,
    }),
  ) as any;
}

/** A display read — the thing that warms the shared observation. */
async function displayRead(blockHeight: number) {
  return ownershipVerifyGET(
    req({}, `http://test.local/api/v1/ownership/verify?blockHeight=${blockHeight}`),
  ) as any;
}

beforeEach(() => {
  db.__reset();
  __resetOwnerObservations();
  getOwner.mockReset();
  chainSays(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── The tier split itself ───────────────────────────────────────

describe('owner-freshness tiers', () => {
  it('AUTH never serves a stored observation — every auth lookup queries live', async () => {
    chainSays('addr-old');
    expect((await resolveInscriptionOwner('insc-a', 'auth'))?.address).toBe('addr-old');

    // Chain state changes with no time passing at all.
    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-a', 'auth'))?.address).toBe('addr-new');
    expect(getOwner).toHaveBeenCalledTimes(2);
  });

  it('a warm DISPLAY observation does not leak into an AUTH answer', async () => {
    chainSays('addr-old');
    await resolveInscriptionOwner('insc-b', 'display'); // warm it

    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-b', 'auth'))?.address).toBe('addr-new');
  });

  it('DISPLAY still caches — the tier split is real, not "cache disabled everywhere"', async () => {
    chainSays('addr-old');
    await resolveInscriptionOwner('insc-c', 'display');

    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-c', 'display'))?.address).toBe('addr-old');
    expect(getOwner).toHaveBeenCalledTimes(1);
  });

  it('DISPLAY re-queries once its observation ages past the TTL', async () => {
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0);
    chainSays('addr-old');
    await resolveInscriptionOwner('insc-d', 'display');

    clock.mockReturnValue(t0 + DISPLAY_TTL_MS + 1);
    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-d', 'display'))?.address).toBe('addr-new');
  });

  it('an AUTH lookup warms the display cache, so live checks pay for reads', async () => {
    chainSays('addr-x');
    await resolveInscriptionOwner('insc-e', 'auth');

    chainSays('addr-y');
    expect((await resolveInscriptionOwner('insc-e', 'display'))?.address).toBe('addr-x');
    expect(getOwner).toHaveBeenCalledTimes(1);
  });

  it('concurrent lookups coalesce into ONE indexer query', async () => {
    // This is what keeps a live auth tier off the indexer's back: the ord client
    // throttles to ~1 req/sec process-wide, so N uncoalesced concurrent checks
    // would serialize into N seconds of write latency.
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => { release = r; });
    chainSays('addr-z');
    getOwner.mockImplementation(async () => { await gate; return { address: 'addr-z', satpoint: SP, source: 'ord.test' }; });

    const all = Promise.all(
      Array.from({ length: 8 }, () => resolveInscriptionOwner('insc-f', 'auth')),
    );
    release(null);
    const results = await all;

    expect(getOwner).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.address === 'addr-z')).toBe(true);
  });

  it('coalescing does not outlive the query — a later auth lookup queries again', async () => {
    chainSays('addr-old');
    await Promise.all([
      resolveInscriptionOwner('insc-g', 'auth'),
      resolveInscriptionOwner('insc-g', 'auth'),
    ]);
    expect(getOwner).toHaveBeenCalledTimes(1);

    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-g', 'auth'))?.address).toBe('addr-new');
    expect(getOwner).toHaveBeenCalledTimes(2);
  });

  it('an indexer outage is not held against the next auth check', async () => {
    chainSays(null); // outage → indeterminate
    expect(await resolveInscriptionOwner('insc-h', 'auth')).toBeNull();

    chainSays('addr-back');
    expect((await resolveInscriptionOwner('insc-h', 'auth'))?.address).toBe('addr-back');
  });

  it('invalidation drops the observation for display reads too', async () => {
    chainSays('addr-old');
    await resolveInscriptionOwner('insc-i', 'display');

    invalidateInscriptionOwner('insc-i');
    chainSays('addr-new');
    expect((await resolveInscriptionOwner('insc-i', 'display'))?.address).toBe('addr-new');
  });
});

// ─── The route that was cache-served ─────────────────────────────

describe('SIM: a sale is honoured on the very next authorization', () => {
  it('WARM CACHE: seller denied immediately after the sale, buyer allowed', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({
      data: { height: 4001, ownerAddress: seller.address, inscriptionId: 'insc-4001' },
    });

    // Warm the shared observation with the PRE-SALE owner via a public read.
    chainSays(seller.address);
    const read: any = await displayRead(4001);
    expect(read.status).toBe(200);

    // The sale lands on-chain. No time passes — this is the adversarial case:
    // under the old shared memo the warm entry would answer for ~5 more minutes.
    chainSays(buyer.address);

    expect((await registerAs(seller, 4001)).status).toBe(403);
    expect(await db.experience.count({ where: { blockHeight: 4001 } })).toBe(0);

    const buyerRes: any = await registerAs(buyer, 4001);
    expect(buyerRes.status).toBe(201);
  });

  it('COLD CACHE: same verdict with no prior observation', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({
      data: { height: 4002, ownerAddress: seller.address, inscriptionId: 'insc-4002' },
    });
    chainSays(buyer.address);

    expect((await registerAs(seller, 4002)).status).toBe(403);
    expect((await registerAs(buyer, 4002)).status).toBe(201);
  });

  it('OTHER DIRECTION: a resale back to the original owner flips authority again', async () => {
    const first = makeWallet('p2tr');
    const second = makeWallet('p2wpkh');
    await db.block.create({
      data: { height: 4003, ownerAddress: first.address, inscriptionId: 'insc-4003' },
    });

    // first → second.
    chainSays(second.address);
    expect((await registerAs(first, 4003)).status).toBe(403);
    expect((await registerAs(second, 4003)).status).toBe(201);

    // second → first, again with no time passing.
    chainSays(first.address);
    expect((await registerAs(second, 4003)).status).toBe(403);
    expect((await registerAs(first, 4003)).status).toBe(201);
  });

  it('a display read AFTER the sale still answers from cache — reads were never the risk', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({
      data: { height: 4004, ownerAddress: seller.address, inscriptionId: 'insc-4004' },
    });

    chainSays(seller.address);
    await displayRead(4004);

    chainSays(buyer.address);
    const read: any = await displayRead(4004);
    expect(read.body.data.onChainOwner).toBe(seller.address); // display tolerance, by design

    // ...but the authorization taken at the same instant is not fooled.
    expect((await registerAs(seller, 4004)).status).toBe(403);
  });
});
