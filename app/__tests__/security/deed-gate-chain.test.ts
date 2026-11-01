/**
 * The ownership gate, the deed lookup and the resolver run as one chain.
 *
 * Every other gate suite stands in for `@/lib/onchain/deed`, and the deed
 * suite stands in for the gate. Here the real `verifyBlockOwnedBy` runs on the
 * real `canonicalDeedFor`; only the sources under them are stood in for: the
 * resolver (`@/vendor/bitmap-resolver`), the database (the memory helper plus
 * a small deed-verdict table), the ord reads, the live holder lookup and the
 * sat tracker. A verdict renamed on one side of the deed module fails here.
 */

const mockResolve = jest.fn();

jest.mock('@/vendor/bitmap-resolver', () => ({
  RULE_ID: 'liveoci-test@1',
  resolve: (...a: unknown[]) => mockResolve(...(a as [])),
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: jest.fn(),
  resolveInscriptionOwnerAddress: jest.fn(),
  invalidateInscriptionOwner: jest.fn(),
}));

jest.mock('@/lib/onchain/ord', () => ({
  getAddressInscriptions: jest.fn(),
  getInscriptionContent: jest.fn(),
  getInscriptionBody: jest.fn(),
  getStatus: async () => ({ height: 960000 }),
  getOrdHosts: () => [],
}));

jest.mock('@/lib/onchain/sat-tracker', () => ({ readInscriptionBodyFromChain: async () => null }));

import prisma from '@/lib/prisma';
import { getInscriptionBody } from '@/lib/onchain/ord';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import { __resetDeedCacheForTest } from '@/lib/onchain/deed';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const DEED = 'cd'.repeat(32) + 'i0';
const W = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

// The deed-verdict table the deed module reads first and writes for buried deeds.
const stored = new Map<number, any>();
db.deedVerdict = {
  findUnique: async ({ where }: { where: { height: number } }) => stored.get(where.height) ?? null,
  upsert: async ({ where, create, update }: any) => {
    stored.set(where.height, { ...(stored.get(where.height) ?? create), ...update });
  },
};

let holder = W;
const realFetch = global.fetch;

function resolved(verdict: string, extra: Record<string, unknown> = {}) {
  return {
    height: BLOCK,
    verdict,
    rule: 'liveoci-test@1',
    canonicalId: verdict === 'canonical' ? DEED : null,
    checkedAtHeight: 960000,
    proof: { canonical: verdict === 'canonical' ? { revealHeight: BLOCK } : null },
    ...(verdict === 'canonical' ? {} : { reason: `resolver says ${verdict}` }),
    ...extra,
  };
}

beforeEach(() => {
  db.__reset();
  stored.clear();
  __resetDeedCacheForTest();
  mockResolve.mockReset();
  holder = W;
  delete process.env.DEED_CROSSCHECK_URL;
  (resolveInscriptionOwner as jest.Mock).mockReset();
  (resolveInscriptionOwner as jest.Mock).mockImplementation(async (id: string) =>
    id === DEED ? { address: holder, source: 'ord:test' } : null,
  );
  (getInscriptionBody as jest.Mock).mockReset();
  (getInscriptionBody as jest.Mock).mockImplementation(async (id: string) =>
    id === DEED ? { text: `${BLOCK}.bitmap`, contentEncoding: null } : null,
  );
  // No other source is asked: any outbound request fails the case.
  global.fetch = jest.fn(async () => {
    throw new Error('no network in this suite');
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

it('the resolver names deed X for block N and W holds X: verified', async () => {
  mockResolve.mockResolvedValue(resolved('canonical'));
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check).toMatchObject({ verified: true, inscriptionId: DEED });
  expect(mockResolve).toHaveBeenCalledTimes(1);
  expect(mockResolve.mock.calls[0][0]).toBe(BLOCK);
  expect(resolveInscriptionOwner).toHaveBeenCalledWith(DEED, 'auth');
});

it('the resolver names deed X and another wallet holds it: refused as not held', async () => {
  mockResolve.mockResolvedValue(resolved('canonical'));
  holder = OTHER;
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check.verified).toBe(false);
  expect(check.unavailable).toBeUndefined();
  expect(check.reason).toBe('Inscription is not held by this wallet');
  expect(check.inscriptionId).toBe(DEED);
});

it('the resolver finds no deed: refused, "no valid .bitmap deed"', async () => {
  mockResolve.mockResolvedValue(resolved('none'));
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check.verified).toBe(false);
  expect(check.unavailable).toBeUndefined();
  expect(check.code).toBe('ownership_not_proven');
  expect(check.reason).toContain('no valid .bitmap deed');
});

it.each(['undetermined', 'disputed'])('the resolver cannot decide (%s): retryable, never a grant', async (verdict) => {
  mockResolve.mockResolvedValue(resolved(verdict));
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check).toMatchObject({ verified: false, unavailable: true, reason: 'onchain_unavailable' });
});

it('a resolver that throws: retryable', async () => {
  mockResolve.mockRejectedValue(new Error('ord down'));
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check).toMatchObject({ verified: false, unavailable: true });
});

it('a deed stored in the verdict table is used without asking the resolver: verified', async () => {
  stored.set(BLOCK, {
    height: BLOCK, inscriptionId: DEED, ruleId: 'liveoci-test@1', revealHeight: BLOCK, checkedAtHeight: 960000,
    resolvedAt: new Date(),
  });
  const check = await verifyBlockOwnedBy(W, BLOCK);
  expect(check).toMatchObject({ verified: true, inscriptionId: DEED });
  expect(mockResolve).not.toHaveBeenCalled();
});
