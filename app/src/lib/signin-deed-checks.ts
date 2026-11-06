/**
 * At most MAX_SIGNIN_DEED_CHECKS new deed checks started by sign-ins
 * (`POST /api/v1/session/verify`) per process.
 *
 * A claimed block whose deed is not already resolving takes a slot for its
 * check while one is free. With every slot taken, a block whose deed this
 * process has an answer for (cached, or a stored verdict) is still checked,
 * and one with no answer is not: the route reports it "retry shortly". A block
 * whose resolution is already running (sign-in or otherwise) never takes a
 * slot, because checking it starts nothing new. The stored verdict is read
 * only when every slot is taken, so a sign-in costs no extra database read.
 * An answered block that took a free slot gives it back as soon as its check
 * returns.
 *
 * A slot is released when its check returns, unless the deed is still
 * resolving then (the check's budget ran out first): the slot then follows that
 * resolution until it lands, SIGNIN_DEED_CHECK_HOLD_MS at the most. Past that a
 * resolution may still be running without a slot, so this bounds the new
 * checks sign-ins start per 45 s, not the checks in flight. Same shape as the
 * page cap in lib/blockPageData (`MAX_PAGE_DEED_CHECKS`).
 */

import { canonicalDeedFor, isDeedResolving, peekCanonicalDeed } from '@/lib/onchain/deed';

export const MAX_SIGNIN_DEED_CHECKS = 8;

/** How long a slot follows a resolution that outlived its check (the cron's per-block budget). */
const SIGNIN_DEED_CHECK_HOLD_MS = 45_000;

/** Heights whose deed check a sign-in started and which have not landed yet. */
const signInDeedChecks = new Set<number>();

/** Test seam: forget every held slot. */
export function __resetSigninDeedChecksForTest(): void {
  signInDeedChecks.clear();
}

/**
 * Whether a sign-in may check `height` now.
 * - `free`: answered or already resolving; check it, no slot taken.
 * - `slot`: a slot was taken; call `releaseSigninDeedCheck` once the check returns.
 * - `full`: every slot is taken; do not check it.
 */
export async function claimSigninDeedCheck(height: number): Promise<'free' | 'slot' | 'full'> {
  const take = (): 'free' | 'slot' | 'full' => {
    // Synchronous: the size test and the add happen together.
    if (isDeedResolving(height) || signInDeedChecks.has(height)) return 'free';
    if (signInDeedChecks.size >= MAX_SIGNIN_DEED_CHECKS) return 'full';
    signInDeedChecks.add(height);
    return 'slot';
  };
  const first = take();
  if (first !== 'full') return first;
  if (await peekCanonicalDeed(height)) return 'free';
  // A slot may have freed, or a resolution started, during the read.
  return take();
}

/** The check for a claimed slot returned: free the slot, or hold it while the deed still resolves. */
export function releaseSigninDeedCheck(height: number): void {
  if (!isDeedResolving(height)) {
    signInDeedChecks.delete(height);
    return;
  }
  // Joins the open resolution (one per height), so this starts nothing new.
  void canonicalDeedFor(height, { budgetMs: SIGNIN_DEED_CHECK_HOLD_MS })
    .catch(() => undefined)
    .finally(() => signInDeedChecks.delete(height));
}
