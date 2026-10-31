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
 * Which inscription is checked is the block's deed as the bitmap resolver
 * decides it (lib/onchain/deed.ts). `Block.inscriptionId` is no longer read
 * here: a stored id is a record of past answers, and the deed question is
 * answered from the chain, cached by the resolver's own table.
 */

import { requireLiveBlockOwner, type GateResult } from '@/lib/ownership-gate';
import type { OwnershipCheck } from '@/lib/onchain/bitmap-ownership';

export interface SignedOwnerOptions {
  verifyOwnership?: (wallet: string, height: number, inscriptionId?: string | null) => Promise<OwnershipCheck>;
  /** Ignored for authorization; kept so existing callers compile. */
  inscriptionId?: string | null;
}

/**
 * Authorize a signature-proved wallet to write to `blockHeight`.
 *
 * @returns A `GateResult` — `ok` when the wallet currently holds the block's
 * deed on-chain. Render denials with `gateDenialResponse`.
 */
export async function requireSignedBlockOwner(
  walletAddress: string,
  blockHeight: number,
  opts: SignedOwnerOptions = {}
): Promise<GateResult> {
  return requireLiveBlockOwner(walletAddress, blockHeight, {
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
