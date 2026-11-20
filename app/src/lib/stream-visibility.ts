/**
 * When a stream on a block is shown.
 *
 * A stream is shown only while the wallet that signed its latest start holds
 * the block, and only if that start was signed less than 12 hours ago: forgotten
 * rows end, and one approval of a channel does not play whatever that channel
 * shows later (the holder can start it again). Both are decided when it is read;
 * nothing runs in the background.
 *
 * The holder is the one the public block page shows: the block's deed by the
 * deed rule (lib/onchain/deed.ts) and that deed's holder on the DISPLAY tier
 * (lib/onchain/owner-freshness.ts): an answer at most DISPLAY_TTL_MS old, named
 * by at least two agreeing sources, joined when another request is already
 * asking. This is a read decision only; who may start or end a stream is asked
 * on the AUTH tier (lib/ownership-gate.ts).
 *
 * Fail closed: an answer that does not come within the caller's budget is
 * 'late', and the lookup is kept alive so it fills the cache for the next
 * request. A holder that cannot be named is 'unconfirmed'.
 */

import { canonicalDeedFor } from '@/lib/onchain/deed';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';

/** A stream reads as ended this long after its latest signed start. */
export const STREAM_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** How long the single read waits for a holder answer it does not have cached (the deed module's request budget). */
export const STREAM_GET_BUDGET_MS = 8000;

/** How long the list waits in all, from the start of its handler. */
export const STREAM_LIST_BUDGET_MS = 1500;

/** How many rows the list asks at once (the tracker runs at most four checks at once). */
export const STREAM_LIST_GROUP = 4;

/** The four stream columns: read only through the livestream routes. */
export const STREAM_COLUMNS = ['streamUrl', 'streamType', 'streamStartedAt', 'streamOwner'] as const;

export type StreamHolderState = 'holds' | 'not_holder' | 'unconfirmed' | 'late';

/** True when a stream started at `startedAt` is past its 12 hours, or has no start time. */
export function streamExpired(startedAt: Date | null, now: number = Date.now()): boolean {
  return !startedAt || now - startedAt.getTime() >= STREAM_MAX_AGE_MS;
}

/** A copy of a Block row without the four stream columns. */
export function withoutStreamColumns<T extends object>(row: T): Omit<T, (typeof STREAM_COLUMNS)[number]> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of STREAM_COLUMNS) delete copy[key];
  return copy as Omit<T, (typeof STREAM_COLUMNS)[number]>;
}

/** Whether `streamOwner` holds `blockHeight` now, by the display-tier chain answer, within `budgetMs`. */
export async function streamHolderState(blockHeight: number, streamOwner: string | null, budgetMs: number): Promise<StreamHolderState> {
  if (!streamOwner) return 'not_holder';
  const lookup = holderOf(blockHeight);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), Math.max(0, budgetMs)); });
  try {
    const answer = await Promise.race([lookup, late]);
    if (answer === 'late') { keepAlive(lookup); return 'late'; }
    if (answer === 'unknown') return 'unconfirmed';
    if (answer === 'none') return 'not_holder';
    return answer === streamOwner ? 'holds' : 'not_holder';
  } catch {
    return 'unconfirmed';
  } finally {
    clearTimeout(timer);
  }
}

/** The deed holder's address; 'none' when the block has no deed; 'unknown' when it cannot be named. */
async function holderOf(blockHeight: number): Promise<string> {
  const deed = await canonicalDeedFor(blockHeight);
  if (deed.verdict === 'none') return 'none';
  if (deed.verdict !== 'canonical' || !deed.inscriptionId) return 'unknown';
  const holder = await resolveInscriptionOwner(deed.inscriptionId, 'display');
  return holder ? holder.address : 'unknown';
}

/**
 * Keep the serverless function alive until a late holder lookup lands, so it
 * fills the display cache (the shape of keepAlive in lib/onchain/deed.ts).
 * `next/server` is loaded lazily; outside a request the lookup simply runs on.
 */
function keepAlive(work: Promise<unknown>): void {
  import('next/server')
    .then(({ after }) => after(() => work.then(() => undefined, () => undefined)))
    .catch(() => {
      // Outside a request (tests): the lookup simply runs on.
    });
}
