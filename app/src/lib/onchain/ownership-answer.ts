/**
 * The public ownership answer, shared by `GET /api/v1/ownership/verify` and
 * `GET /api/v1/ownership/[height]` (and through them the MCP
 * `bg_ownership_verify` tool, which returns the route's JSON as-is).
 *
 * The rule this shape exists to keep: an outage is never a negative. When no
 * source could name the holder, `onChainOwner` is null, `verdict` is `unknown`,
 * `chain` is `unavailable` and `match` is null — not `false`, which every
 * caller reads as "this wallet does not hold the block".
 *
 * Fields added 2026-10-22 (`match` was a boolean before):
 *   - `verdict`: `match` | `mismatch` | `unknown`.
 *   - `chain`: `ok` (a source named the holder), `unavailable` (none could),
 *     `unchecked` (no inscription id on file, so nothing was asked).
 *   - `source`: the ord host or `esplora:<host>` that answered, when one did.
 *   - `checkedAt`: when that check ran (display reads share a cached check).
 *   - `lastVerifiedAt` / `unavailableSince`: this server's memory of the last
 *     answer and of when answers stopped.
 */

import type { OwnershipCheck } from '@/lib/ownership-sync';
import { getOwnerAvailability } from '@/lib/onchain/owner-freshness';

export type OwnershipVerdict = 'match' | 'mismatch' | 'unknown';
export type ChainState = 'ok' | 'unavailable' | 'unchecked';

export interface OwnershipAnswer {
  blockHeight: number;
  dbOwner: string | null;
  onChainOwner: string | null;
  /** Equality of chain and record when the chain answered; null when it could not. */
  match: boolean | null;
  verdict: OwnershipVerdict;
  chain: ChainState;
  source: string | null;
  checkedAt: string | null;
  lastVerifiedAt: string | null;
  unavailableSince: string | null;
  inscriptionId: string | null;
  action: OwnershipCheck['action'];
  /** When this response was built. Kept for existing clients. */
  lastChecked: string;
}

export function ownershipAnswer(check: OwnershipCheck, now: Date = new Date()): OwnershipAnswer {
  const answered = !check.indeterminate && check.onChainOwnerAddress !== null;
  const availability = check.inscriptionId ? getOwnerAvailability(check.inscriptionId) : null;
  const chain: ChainState = check.inscriptionId === null ? 'unchecked' : answered ? 'ok' : 'unavailable';

  return {
    blockHeight: check.blockHeight,
    dbOwner: check.dbOwnerAddress,
    onChainOwner: check.onChainOwnerAddress,
    match: answered ? check.match : null,
    verdict: answered ? (check.match ? 'match' : 'mismatch') : 'unknown',
    chain,
    source: answered ? availability?.source ?? null : null,
    checkedAt: availability?.checkedAt ?? null,
    lastVerifiedAt: availability?.lastVerifiedAt ?? null,
    unavailableSince: chain === 'unavailable' ? availability?.unavailableSince ?? null : null,
    inscriptionId: check.inscriptionId,
    action: check.action,
    lastChecked: now.toISOString(),
  };
}
