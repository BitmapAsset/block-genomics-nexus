/**
 * What the page makes of the two stream reads (GET /api/v1/livestream and /livestream/active). The server decides
 * whether a stream is shown (lib/stream-visibility.ts); the page keeps a frame that is already playing while an
 * answer is only `unconfirmed`, closes it with plain words when the stream has ended, and never brings an ended
 * stream back in the same tab.
 */

/** 12 hours, as lib/stream-visibility.ts STREAM_MAX_AGE_MS (a test reads both). */
export const STREAM_SHOWN_FOR_MS = 12 * 60 * 60 * 1000;

/** How often the block page asks again while a stream is live. */
export const STREAM_REREAD_MS = 60_000;

export type StreamEnded = 'expired' | 'holder_changed' | 'unconfirmed';

export type LiveStreamRead = {
  kind: 'live';
  streamUrl: string;
  embedUrl: string;
  streamType: string;
  startedAt: string;
  startedBy: string | null;
};

export type StreamRead = { kind: 'none' } | LiveStreamRead | { kind: 'hidden'; ended: StreamEnded };

/** The single read's answer, or null when it is not one of its three shapes (the caller keeps what it had). */
export function parseStreamRead(body: unknown): StreamRead | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.live === true) {
    if (typeof b.streamUrl !== 'string' || typeof b.embedUrl !== 'string' || typeof b.startedAt !== 'string') return null;
    return {
      kind: 'live',
      streamUrl: b.streamUrl,
      embedUrl: b.embedUrl,
      streamType: typeof b.streamType === 'string' ? b.streamType : 'broadcast',
      startedAt: b.startedAt,
      startedBy: typeof b.startedBy === 'string' ? b.startedBy : null,
    };
  }
  if (b.live === false) {
    if (b.ended === undefined) return { kind: 'none' };
    if (b.ended === 'expired' || b.ended === 'holder_changed' || b.ended === 'unconfirmed') return { kind: 'hidden', ended: b.ended };
    return null;
  }
  return null;
}

/** When a stream started at `startedAt` stops being shown, in ms since the epoch (NaN for an unreadable time). */
export function streamEndsAt(startedAt: string): number {
  return Date.parse(startedAt) + STREAM_SHOWN_FOR_MS;
}

/** A stream's identity on a page: its player address and the server's start time. A stream started again is new. */
export function streamIdentity(s: { embedUrl: string; startedAt: string }): string {
  return `${s.embedUrl}|${s.startedAt}`;
}

export type ShownStatus = 'live' | 'unconfirmed' | 'ended';

/** The block page's whole stream state; only `nextPageStream` and `endPastTwelveHours` change it. */
export type PageStream = {
  /** The block this state belongs to. */
  height: number;
  /** The stream the page shows, with the player's status; null when none is shown. */
  shown: { stream: LiveStreamRead; status: ShownStatus } | null;
  /** Identities that ended in this tab: they stay ended. */
  ended: readonly string[];
  /** The last usable answer (the go-live window reads it). */
  read: StreamRead;
  /** Whether the last answer was usable. */
  usable: boolean;
  /** Answers in a row that left the page unsettled (unusable or `unconfirmed`) with no stream shown as live or unconfirmed. */
  unsettled: number;
};

export function emptyPageStream(height: number): PageStream {
  return { height, shown: null, ended: [], read: { kind: 'none' }, usable: true, unsettled: 0 };
}

/** Rule 5: a stream shown as live or unconfirmed whose 12 hours have passed on this clock turns ended, for good. */
export function endPastTwelveHours(s: PageStream, now: number): PageStream {
  const sh = s.shown;
  if (sh === null || sh.status === 'ended' || now < streamEndsAt(sh.stream.startedAt)) return s;
  return { ...s, shown: { ...sh, status: 'ended' }, ended: [...s.ended, streamIdentity(sh.stream)] };
}

/**
 * The block page's state after one answer of the single read (`null` = unusable: no 200, no JSON, a failed request),
 * at `now`, for the page's block `height`. In order: (6) another height starts from the empty state; (1) a live
 * answer shows that stream, unless its identity ended in this tab; (2) `unconfirmed` keeps a stream shown as live or
 * unconfirmed, as unconfirmed, and shows no other; (3) `expired`, `holder_changed` or no stream end a shown stream and
 * remember it; (4) an unusable answer changes nothing shown; (5) then a shown stream past its 12 hours turns ended.
 */
export function nextPageStream(prev: PageStream, answer: StreamRead | null, now: number, height: number): PageStream {
  const s = prev.height === height ? prev : emptyPageStream(height);
  const sh = s.shown;
  const playing = sh !== null && sh.status !== 'ended';
  let next: PageStream;
  if (answer === null) {
    next = { ...s, usable: false };
  } else if (answer.kind === 'live') {
    const endedBefore = s.ended.includes(streamIdentity(answer));
    next = { ...s, read: answer, usable: true, shown: endedBefore ? sh : { stream: answer, status: 'live' } };
  } else if (answer.kind === 'hidden' && answer.ended === 'unconfirmed') {
    next = { ...s, read: answer, usable: true, shown: sh !== null && playing ? { ...sh, status: 'unconfirmed' } : sh };
  } else {
    next = sh !== null && playing
      ? { ...s, read: answer, usable: true, shown: { ...sh, status: 'ended' }, ended: [...s.ended, streamIdentity(sh.stream)] }
      : { ...s, read: answer, usable: true };
  }
  const unsettled = !next.usable || (next.read.kind === 'hidden' && next.read.ended === 'unconfirmed');
  const showing = next.shown !== null && next.shown.status !== 'ended';
  return endPastTwelveHours({ ...next, unsettled: unsettled && !showing ? s.unsettled + 1 : 0 }, now);
}

/** The re-ask schedule after an unsettled answer: 3, 6, 12, 24 s, then none. `n` counts the re-asks already made. */
export const RECHECK_DELAYS_MS: readonly number[] = [3000, 6000, 12000, 24000];

export function recheckDelay(n: number): number | null {
  return n >= 0 && n < RECHECK_DELAYS_MS.length ? RECHECK_DELAYS_MS[n] : null;
}

/**
 * When the block page asks the single read again (ms), or null when it does not: every 60 s while a stream is shown
 * as live or unconfirmed; by the re-ask schedule and then every 60 s while its answers are unsettled and no stream is
 * shown; never after a usable answer of no stream, `expired` or `holder_changed` (a stream started later shows after
 * a reload).
 */
export function blockPageAskDelay(s: PageStream): number | null {
  if (s.shown !== null && s.shown.status !== 'ended') return STREAM_REREAD_MS;
  if (s.unsettled > 0) return recheckDelay(s.unsettled - 1) ?? STREAM_REREAD_MS;
  return null;
}

/** A playing card on /live that the list left out stays while its own read is that stream live, unconfirmed or unusable. */
export function keepPlayingCard(read: StreamRead | null, id: string): boolean {
  return read === null || (read.kind === 'live' && streamIdentity(read) === id) || (read.kind === 'hidden' && read.ended === 'unconfirmed');
}

/**
 * The new list's cards, then the playing cards the new list left out (each to be asked again on its own), keyed by
 * identity. A card whose identity ended stays (it reads ENDED) while a list returns it, and goes when a list leaves it out.
 */
export function mergeLiveList<T extends { embedUrl: string; startedAt: string }>(prev: T[], incoming: T[], playing: ReadonlySet<string>, ended: ReadonlySet<string>): { cards: T[]; recheck: string[] } {
  const seen = new Set(incoming.map(streamIdentity));
  const kept = prev.filter(c => playing.has(streamIdentity(c)) && !ended.has(streamIdentity(c)) && !seen.has(streamIdentity(c)));
  return { cards: [...incoming, ...kept], recheck: kept.map(streamIdentity) };
}

/** A /live card's status: ended when its identity ended in this tab or its 12 hours have passed on this clock. */
export function liveCardStatus(card: { embedUrl: string; startedAt: string }, ended: ReadonlySet<string>, checking: ReadonlySet<string>, now: number): ShownStatus {
  const id = streamIdentity(card);
  if (ended.has(id) || now >= streamEndsAt(card.startedAt)) return 'ended';
  return checking.has(id) ? 'unconfirmed' : 'live';
}

/** Twitch asks for a player of at least 400 x 300 px; at 16:10 a height of 300 needs a width of 480. Others are not bound. */
export const TWITCH_MIN_WIDTH = 480;
export const TWITCH_MIN_HEIGHT = 300;

export function playerBoxFits(platform: string, width: number, height: number): boolean {
  return platform !== 'Twitch' || (width >= TWITCH_MIN_WIDTH && height >= TWITCH_MIN_HEIGHT);
}

/** What the go-live window says about a stream the page hides. */
export function hiddenStreamNote(ended: StreamEnded): string {
  if (ended === 'expired') return 'The stream on this block reached its 12 hours and is no longer shown. If you hold this block, start it again to show it, or end it.';
  if (ended === 'holder_changed') return 'A stream started by an earlier holder of this block is set here and is not shown. The holder of the block can end it.';
  return 'A stream is set on this block. Who holds the block cannot be confirmed right now, so it is not shown. If you just started it, it shows here once that is confirmed.';
}

/** The go-live window's notes (from browser tests of the three players). With the switch off they speak of a link, never of a player or of Play. */
export function goLiveNotes(playersOn: boolean): readonly string[] {
  return [
    playersOn
      ? 'Paste your YouTube, Twitch or Kick link. Visitors see your stream on this block and on /live after they click Play.'
      : 'Paste your YouTube, Twitch or Kick link. Visitors see a link to your stream on this block and on /live.',
    ...(playersOn ? ['Live streams from YouTube, Twitch and Kick play here after a visitor clicks. Twitch may show an ad or its own notice for mature games first, and on a small screen a Twitch stream opens on Twitch. Age-restricted YouTube videos and private streams do not play on other sites.'] : []),
    'Shown only while your wallet holds this block, and for 12 hours after you start it. It may stay visible for a few minutes after a sale. A stream can be started on the blocks whose deed is recorded on this site.',
    'A feature of the Block Genomics site: the picture comes from YouTube, Twitch or Kick, under their terms.',
  ];
}
