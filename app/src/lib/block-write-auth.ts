/**
 * "This wallet signed. Does it own the block it is trying to write to?"
 *
 * The browser path proves a wallet with an action-bound BIP-322 signature, which
 * says who is asking but nothing about what they own. Before this module the
 * routes answered the ownership half from `Block.ownerAddress` — our own cache,
 * refreshed by a background sync. That is the stale-snapshot failure the agent
 * gate was built to avoid, reached by the other door: between an on-chain sale
 * and the next sync, the cache still names the seller, so the seller could keep
 * building on a block they no longer own and the buyer would be refused on the
 * block they just bought.
 *
 * So both credential paths now end at the same live question, asked at the moment
 * of the action, with the same fail-closed semantics: an indexer outage is a
 * retryable 503, never a grant.
 *
 * The one thing still read from the database is `Block.inscriptionId` — an
 * identifier, not an ownership claim. It lets the check ask about one known
 * inscription instead of scanning up to 50 of the wallet's holdings. It cannot
 * grant anything on its own: the live check still requires that a live indexer
 * names this wallet as the current holder AND that the inscription's content
 * names this block, so a wrong, stale, or attacker-influenced hint can only make
 * the check slower, never more permissive.
 */

import prisma from '@/lib/prisma';
import { requireLiveBlockOwner, type GateResult } from '@/lib/ownership-gate';
import type { OwnershipCheck } from '@/lib/onchain/bitmap-ownership';

export interface SignedOwnerOptions {
  verifyOwnership?: (wallet: string, height: number, inscriptionId?: string | null) => Promise<OwnershipCheck>;
  /** Skip the inscription-hint lookup (tests, or when the caller already has it). */
  inscriptionId?: string | null;
}

/**
 * Authorize a signature-proved wallet to write to `blockHeight`.
 *
 * @returns A `GateResult` — `ok` when the wallet currently holds the block's
 * `.bitmap` inscription on-chain. Render denials with `gateDenialResponse`.
 */
export async function requireSignedBlockOwner(
  walletAddress: string,
  blockHeight: number,
  opts: SignedOwnerOptions = {}
): Promise<GateResult> {
  let inscriptionId = opts.inscriptionId ?? null;

  if (inscriptionId === null && opts.inscriptionId === undefined) {
    // A missing row or an unreachable database costs us the fast path, not the
    // answer — the live check falls back to scanning the wallet's holdings.
    try {
      const block = await prisma.block.findUnique({
        where: { height: blockHeight },
        select: { inscriptionId: true },
      });
      inscriptionId = block?.inscriptionId ?? null;
    } catch {
      inscriptionId = null;
    }
  }

  return requireLiveBlockOwner(walletAddress, blockHeight, {
    inscriptionId,
    ...(opts.verifyOwnership ? { verifyOwnership: opts.verifyOwnership } : {}),
  });
}

/** The stored fields an object-level authorization decision is allowed to see. */
export interface MutableObject {
  id: string;
  blockHeight: number;
  locked: boolean;
}

/**
 * Everything left to decide once the caller has proved they own `ownedBlock`.
 *
 * Deliberately not a parameter: who created the object. Authorship is provenance,
 * not permission, so the current holder edits and deletes a previous owner's work
 * exactly as if it were their own.
 *
 * Two things still refuse:
 *
 *   SCOPE  — the object must live on the block that was actually proved. The
 *            `/world/[id]` routes derive the block from the stored object so this
 *            always holds; `/world/batch` takes ids from the request body, where
 *            it is the check that stops one owned block from being used as a
 *            credential for objects on another.
 *   LOCK   — `locked` is an accident guard, so it blocks edits. But a lock the
 *            seller left behind must not be permanent, or a buyer inherits a
 *            block they can never change. Clearing the lock is therefore always
 *            allowed to the current owner; the edit lands on the next request.
 */
export function authorizeObjectWrite(
  obj: MutableObject,
  ownedBlock: number,
  intent: { unlocking?: boolean } = {}
): GateResult {
  if (obj.blockHeight !== ownedBlock) {
    return {
      ok: false,
      status: 403,
      code: 'out_of_scope',
      reason: `Object ${obj.id} is on block ${obj.blockHeight}, not block ${ownedBlock}.`,
    };
  }

  if (obj.locked && !intent.unlocking) {
    return {
      ok: false,
      status: 403,
      code: 'bad_request',
      reason: `Object ${obj.id} is locked. Set \`locked: false\` to unlock it first.`,
    };
  }

  return { ok: true, status: 200 };
}
