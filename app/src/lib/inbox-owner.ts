/**
 * Who may read a block's DM inbox: its live holder, asked on every read.
 *
 * A DM row's recipient is whoever holds the block it was sent to. A verified
 * session proves the wallet held the block when it signed in, and
 * `Block.ownerAddress` is a stored observation; neither says who holds the
 * block now. So the two DM read paths (`GET /api/v1/chat/<h>?channel=dm` and
 * `GET /api/v1/chat/history?mode=dm`) also ask the chain gate
 * (`requireLiveBlockOwner`). Nothing is remembered between reads; a read that
 * arrives while the same wallet's check for the same block is running joins
 * it. A check that is refused or cannot answer reads as "not the holder": the
 * reader then sees only what it sent.
 */

import { requireLiveBlockOwner } from '@/lib/ownership-gate';

/** Live holder checks one DM history read runs at once. */
const HISTORY_CHECK_CONCURRENCY = 4;

const inFlight = new Map<string, Promise<boolean>>();

/** True when `wallet` holds `height` on-chain right now. Never throws. */
export function isLiveInboxOwner(wallet: string, height: number): Promise<boolean> {
  const key = `${wallet}:${height}`;
  let check = inFlight.get(key);
  if (!check) {
    check = requireLiveBlockOwner(wallet, height)
      .then((gate) => gate.ok, () => false)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, check);
  }
  return check;
}

/** The heights of `heights` that `wallet` holds right now, checked HISTORY_CHECK_CONCURRENCY at a time. */
export async function liveInboxHeights(wallet: string, heights: number[]): Promise<number[]> {
  const unique = [...new Set(heights)];
  const held: number[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(HISTORY_CHECK_CONCURRENCY, unique.length) }, async () => {
    while (next < unique.length) {
      const height = unique[next++];
      if (await isLiveInboxOwner(wallet, height)) held.push(height);
    }
  });
  await Promise.all(workers);
  return held.sort((a, b) => a - b);
}
