/**
 * Test seam for "who holds this block right now?".
 *
 * The app asks that question in exactly one place — `verifyBlockOwnedBy` — so
 * that is the one place a simulation should mock. Several suites predate the
 * unification and express chain state through the older `ord.getInscriptionOwner`
 * mock instead. `verifyBlockOwnedByFromOrdMock` maps that existing control
 * surface onto the current seam so those suites keep their exact vocabulary:
 *
 *   getOwner.mockResolvedValue(onChain(addr))  →  addr holds the block
 *   getOwner.mockResolvedValue(null)           →  no indexer can answer (503)
 *
 * NOT collected by Jest (filename is not *.test.ts).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OwnershipCheckLike {
  verified: boolean;
  unavailable?: boolean;
  reason?: string;
  inscriptionId?: string;
}

/**
 * Build a `@/lib/onchain/bitmap-ownership` mock that answers from whatever the
 * suite's `@/lib/onchain/ord` mock currently reports as the inscription owner.
 *
 * A null owner is an OUTAGE, not a negative: the caller cannot distinguish "no
 * indexer answered" from "answered, and it is not you" unless we say so, and
 * conflating them is what the lenient snapshot fallback used to do.
 */
/**
 * Build a `@/lib/onchain/bitmap-ownership` mock that answers from the seeded
 * `block.ownerAddress` fixture — i.e. "the chain agrees with the fixture".
 *
 * For suites whose subject is tokens, scoping, or replay rather than ownership
 * freshness, the seeded owner IS the intended chain truth, and
 * `processOwnershipTransfer` moving that row IS the sale. Suites that need the
 * cache and the chain to DISAGREE (the sale→sync lag window) must not use this
 * — they should drive the chain independently, as the ownership suites do.
 */
export function verifyBlockOwnedByFromDbFixture() {
  return {
    verifyBlockOwnedBy: async (walletAddress: string, blockHeight: number): Promise<OwnershipCheckLike> => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const prisma: any = require('@/lib/prisma').default;
      const block = await prisma.block.findUnique({ where: { height: blockHeight } });
      if (block?.ownerAddress === walletAddress) {
        return { verified: true, inscriptionId: block.inscriptionId ?? 'insc-live' };
      }
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    },
  };
}

/**
 * Like `verifyBlockOwnedByFromOrdMock`, but the owner lookup goes through the
 * REAL freshness layer at the AUTH tier.
 *
 * For the freshness suite this linkage is the subject, not scaffolding: the bug
 * it pins is an authorization being answered from an observation a display read
 * warmed. A mock that read `ord.getInscriptionOwner` directly would bypass
 * `owner-freshness` entirely and those route cases would pass no matter how the
 * tiers were wired. Only the wallet scan and the content check — neither of
 * which can run without network — are stood in for here.
 */
export function verifyBlockOwnedByViaAuthFreshness() {
  return {
    verifyBlockOwnedBy: async (walletAddress: string, blockHeight: number): Promise<OwnershipCheckLike> => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const prisma: any = require('@/lib/prisma').default;
      const { resolveInscriptionOwner } = require('@/lib/onchain/owner-freshness');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const block = await prisma.block.findUnique({ where: { height: blockHeight } });
      const owner = await resolveInscriptionOwner(block?.inscriptionId ?? `insc-${blockHeight}`, 'auth');
      if (!owner) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
      if (owner.address === walletAddress) return { verified: true, inscriptionId: block?.inscriptionId };
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    },
  };
}

export function verifyBlockOwnedByFromOrdMock() {
  return {
    verifyBlockOwnedBy: async (walletAddress: string): Promise<OwnershipCheckLike> => {
      // Required lazily: jest.mock factories are hoisted above imports.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ord: any = require('@/lib/onchain/ord');
      const owner = await ord.getInscriptionOwner();
      if (!owner) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
      const address = typeof owner === 'string' ? owner : owner.address;
      if (address === walletAddress) return { verified: true, inscriptionId: 'insc-live' };
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    },
  };
}
