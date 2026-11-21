/**
 * lib/stream-read: what the page makes of the two stream reads. The server decides whether a stream is shown; the
 * page keeps a frame that is already playing while an answer is only `unconfirmed`, closes it when the stream has
 * ended, and never brings an ended stream back in the same tab.
 */

import fs from 'fs';
import path from 'path';
import {
  STREAM_SHOWN_FOR_MS,
  TWITCH_MIN_HEIGHT,
  TWITCH_MIN_WIDTH,
  blockPageAskDelay,
  emptyPageStream,
  endPastTwelveHours,
  goLiveNotes,
  hiddenStreamNote,
  keepPlayingCard,
  liveCardStatus,
  mergeLiveList,
  nextPageStream,
  parseStreamRead,
  playerBoxFits,
  recheckDelay,
  streamEndsAt,
  streamIdentity,
  type LiveStreamRead,
  type PageStream,
  type StreamRead,
} from '@/lib/stream-read';

const TWITCH = 'https://player.twitch.tv/?channel=somechannel&parent=blockgenomics.io&parent=www.blockgenomics.io&autoplay=true&muted=true';
const LIVE_A: LiveStreamRead = {
  kind: 'live',
  streamUrl: 'https://www.twitch.tv/somechannel',
  embedUrl: TWITCH,
  streamType: 'broadcast',
  startedAt: '2026-11-20T00:00:00.000Z',
  startedBy: 'bc1pholder',
};
const LIVE_B: LiveStreamRead = { ...LIVE_A, startedAt: '2026-11-20T01:00:00.000Z' };
const UNCONF: StreamRead = { kind: 'hidden', ended: 'unconfirmed' };
const T0 = Date.parse('2026-11-20T01:00:00.000Z');
const H = 840000;

/** The page state after these answers, one after another, from the empty state. */
function after(answers: (StreamRead | null)[], now = T0, height = H): PageStream {
  return answers.reduce<PageStream>((s, a) => nextPageStream(s, a, now, height), emptyPageStream(height));
}

describe('parseStreamRead', () => {
  it('R1 a live answer becomes a live read; one without its link, player or start time is unusable', () => {
    const body = {
      live: true,
      streamUrl: 'https://www.twitch.tv/somechannel',
      streamType: 'broadcast',
      startedAt: '2026-11-20T00:00:00.000Z',
      embedUrl: TWITCH,
      startedBy: 'bc1pholder',
    };
    expect(parseStreamRead(body)).toEqual({
      kind: 'live',
      streamUrl: 'https://www.twitch.tv/somechannel',
      embedUrl: TWITCH,
      streamType: 'broadcast',
      startedAt: '2026-11-20T00:00:00.000Z',
      startedBy: 'bc1pholder',
    });
    const { embedUrl: _dropped, ...withoutEmbed } = body;
    void _dropped;
    expect(parseStreamRead(withoutEmbed)).toBeNull();
    expect(parseStreamRead({ ...body, streamUrl: null })).toBeNull();
    expect(parseStreamRead({ ...body, startedAt: 5 })).toBeNull();
  });

  it('R2 the other answers', () => {
    expect(parseStreamRead({ live: false })).toEqual({ kind: 'none' });
    for (const ended of ['expired', 'holder_changed', 'unconfirmed'] as const) {
      expect(parseStreamRead({ live: false, ended })).toEqual({ kind: 'hidden', ended });
    }
    for (const body of [{ live: false, ended: 'gone' }, {}, null, undefined, 'live']) {
      expect(parseStreamRead(body)).toBeNull();
    }
  });

  it('R18 a live answer keeps its stream type; one without a type reads as a broadcast', () => {
    const body = { live: true, streamUrl: 'https://www.twitch.tv/somechannel', startedAt: '2026-11-20T00:00:00.000Z', embedUrl: TWITCH };
    expect(parseStreamRead({ ...body, streamType: 'townhall' })).toMatchObject({ kind: 'live', streamType: 'townhall', startedBy: null });
    expect(parseStreamRead(body)).toMatchObject({ kind: 'live', streamType: 'broadcast', startedBy: null });
    expect(parseStreamRead({ ...body, streamType: 7, startedBy: 'bc1pholder' })).toMatchObject({ streamType: 'broadcast', startedBy: 'bc1pholder' });
  });
});

describe('nextPageStream', () => {
  it('R3 rule 1: a live answer shows its stream, and a stream that ended stays ended in the tab', () => {
    let s = nextPageStream(emptyPageStream(H), LIVE_A, T0, H);
    expect(s.shown).toEqual({ stream: LIVE_A, status: 'live' });
    s = nextPageStream(s, { kind: 'none' }, T0, H);
    expect(s.shown?.status).toBe('ended');
    expect(s.ended).toEqual([streamIdentity(LIVE_A)]);
    s = nextPageStream(s, LIVE_A, T0, H);
    expect(s.shown?.status).toBe('ended');
    expect(s.ended).toEqual([streamIdentity(LIVE_A)]);
    s = nextPageStream(s, LIVE_B, T0, H);
    expect(s.shown).toEqual({ stream: LIVE_B, status: 'live' });
  });

  it('R4 rule 2: `unconfirmed` keeps a shown stream as unconfirmed and shows no other', () => {
    let s = after([LIVE_A, UNCONF]);
    expect(s.shown).toEqual({ stream: LIVE_A, status: 'unconfirmed' });
    s = nextPageStream(s, UNCONF, T0, H);
    expect(s.shown).toEqual({ stream: LIVE_A, status: 'unconfirmed' });
    const e = after([UNCONF]);
    expect(e.shown).toBeNull();
    expect(e.read).toEqual(UNCONF);
    const ended = after([LIVE_A, { kind: 'none' }, UNCONF]);
    expect(ended.shown).toEqual({ stream: LIVE_A, status: 'ended' });
  });

  it('R5 rule 3: `expired`, `holder_changed` or no stream end a shown stream and remember it', () => {
    const answers: StreamRead[] = [{ kind: 'hidden', ended: 'expired' }, { kind: 'hidden', ended: 'holder_changed' }, { kind: 'none' }];
    for (const answer of answers) {
      for (const before of [[LIVE_A], [LIVE_A, UNCONF]] as StreamRead[][]) {
        const s = after([...before, answer]);
        expect(s.shown?.status).toBe('ended');
        expect(s.ended).toContain(streamIdentity(LIVE_A));
        expect(s.read).toEqual(answer);
      }
      const e = after([answer]);
      expect(e.shown).toBeNull();
      expect(e.read).toEqual(answer);
    }
  });

  it('R6 rule 4: an unusable answer changes nothing shown', () => {
    const s = after([LIVE_A]);
    const n = nextPageStream(s, null, T0, H);
    expect(n.shown).toEqual(s.shown);
    expect(n.read).toEqual(s.read);
    expect(n.usable).toBe(false);
  });

  it('R7 rule 5: a shown stream ends at its 12 hours on the visitor\'s clock, whatever the answer', () => {
    const s = after([LIVE_A]);
    const end = streamEndsAt(LIVE_A.startedAt);
    expect(nextPageStream(s, LIVE_A, end - 1, H).shown?.status).toBe('live');
    expect(nextPageStream(s, LIVE_A, end, H).shown?.status).toBe('ended');
    expect(nextPageStream(s, null, end, H).shown?.status).toBe('ended');
    expect(nextPageStream(s, UNCONF, end, H).shown?.status).toBe('ended');
    const p = endPastTwelveHours(s, end);
    expect(p.shown?.status).toBe('ended');
    expect(p.ended).toContain(streamIdentity(LIVE_A));
  });

  it('R8 rule 6: another block starts from the empty state', () => {
    const s: PageStream = { ...emptyPageStream(H), shown: { stream: LIVE_A, status: 'live' }, ended: [streamIdentity(LIVE_A)] };
    const n = nextPageStream(s, null, T0, 840001);
    expect(n.height).toBe(840001);
    expect(n.shown).toBeNull();
    expect(n.ended).toEqual([]);
  });

  it('R9 the block page asks by one bounded schedule', () => {
    expect(recheckDelay(-1)).toBeNull();
    expect(recheckDelay(0)).toBe(3000);
    expect(recheckDelay(1)).toBe(6000);
    expect(recheckDelay(2)).toBe(12000);
    expect(recheckDelay(3)).toBe(24000);
    expect(recheckDelay(4)).toBeNull();
    expect(blockPageAskDelay(after([LIVE_A]))).toBe(60000);
    expect(blockPageAskDelay(after([LIVE_A, UNCONF]))).toBe(60000);
    const expected = [3000, 6000, 12000, 24000, 60000];
    for (let n = 1; n <= 5; n++) {
      expect(blockPageAskDelay(after(Array<StreamRead>(n).fill(UNCONF)))).toBe(expected[n - 1]);
    }
    const twoNull = after([null, null]);
    expect(blockPageAskDelay(twoNull)).toBe(6000);
    const live = nextPageStream(twoNull, LIVE_A, T0, H);
    expect(blockPageAskDelay(live)).toBe(60000);
    expect(live.unsettled).toBe(0);
    expect(blockPageAskDelay(after([{ kind: 'none' }]))).toBeNull();
    expect(blockPageAskDelay(after([{ kind: 'hidden', ended: 'expired' }]))).toBeNull();
  });

  it('R17 the block page asks no more once the stream it showed has ended', () => {
    const answers: StreamRead[] = [{ kind: 'hidden', ended: 'expired' }, { kind: 'hidden', ended: 'holder_changed' }, { kind: 'none' }];
    for (const answer of answers) {
      const s = after([LIVE_A, answer]);
      expect(s.shown?.status).toBe('ended');
      expect(blockPageAskDelay(s)).toBeNull();
    }
    const past = endPastTwelveHours(after([LIVE_A]), streamEndsAt(LIVE_A.startedAt));
    expect(past.shown?.status).toBe('ended');
    expect(blockPageAskDelay(past)).toBeNull();
  });
});

describe('/live cards', () => {
  type Card = { embedUrl: string; startedAt: string; tag: string };
  const A: Card = { embedUrl: 'https://player.kick.com/channel-a', startedAt: '2026-11-20T00:00:00.000Z', tag: 'A' };
  const A2: Card = { ...A, tag: "A'" };
  const B: Card = { embedUrl: 'https://player.kick.com/channel-b', startedAt: '2026-11-20T00:00:00.000Z', tag: 'B' };
  const C: Card = { embedUrl: 'https://player.kick.com/channel-c', startedAt: '2026-11-20T00:00:00.000Z', tag: 'C' };
  const id = streamIdentity;

  it('R10 a playing card on /live is kept only while its own read is that stream live, unconfirmed or unusable', () => {
    const card = streamIdentity(LIVE_A);
    expect(keepPlayingCard(null, card)).toBe(true);
    expect(keepPlayingCard(LIVE_A, card)).toBe(true);
    expect(keepPlayingCard(LIVE_B, card)).toBe(false);
    expect(keepPlayingCard({ kind: 'hidden', ended: 'unconfirmed' }, card)).toBe(true);
    expect(keepPlayingCard({ kind: 'hidden', ended: 'expired' }, card)).toBe(false);
    expect(keepPlayingCard({ kind: 'hidden', ended: 'holder_changed' }, card)).toBe(false);
    expect(keepPlayingCard({ kind: 'none' }, card)).toBe(false);
  });

  it('R11 the list keeps playing cards it left out, by identity, after its own cards, and asks for them again', () => {
    expect(mergeLiveList([A, B], [A2, C], new Set([id(B)]), new Set())).toEqual({ cards: [A2, C, B], recheck: [id(B)] });
    expect(mergeLiveList([A, B], [A2, C], new Set(), new Set())).toEqual({ cards: [A2, C], recheck: [] });
    expect(mergeLiveList([A, B], [A2, C], new Set([id(A), id(B)]), new Set())).toEqual({ cards: [A2, C, B], recheck: [id(B)] });
    expect(mergeLiveList([A, B], [A2, C], new Set([id(B)]), new Set([id(B)]))).toEqual({ cards: [A2, C], recheck: [] });
    const Blater: Card = { ...B, startedAt: '2026-11-20T01:00:00.000Z', tag: 'B later' };
    expect(mergeLiveList([A, B], [A2, Blater], new Set([id(B)]), new Set())).toEqual({ cards: [A2, Blater, B], recheck: [id(B)] });
  });

  it('R12 a /live card that ended stays ENDED while a list still returns it', () => {
    expect(liveCardStatus(A, new Set([id(A)]), new Set(), T0)).toBe('ended');
    expect(mergeLiveList([A], [A2], new Set(), new Set([id(A)])).cards).toEqual([A2]);
    expect(liveCardStatus(A, new Set(), new Set(), streamEndsAt(A.startedAt))).toBe('ended');
    expect(liveCardStatus(A, new Set(), new Set([id(A)]), T0)).toBe('unconfirmed');
    expect(liveCardStatus(A, new Set(), new Set(), T0)).toBe('live');
  });
});

describe('times, sizes and words', () => {
  it('R13 a stream is shown for 12 hours after its start', () => {
    expect(STREAM_SHOWN_FOR_MS).toBe(43200000);
    expect(streamEndsAt('2026-11-20T00:00:00.000Z')).toBe(Date.parse('2026-11-20T00:00:00.000Z') + 43200000);
    const visibility = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'stream-visibility.ts'), 'utf8');
    expect(visibility).toContain('export const STREAM_MAX_AGE_MS = 12 * 60 * 60 * 1000;');
  });

  it('R14 Twitch plays only in a box of at least 480 x 300; the others are not bound', () => {
    expect(playerBoxFits('Twitch', 480, 300)).toBe(true);
    expect(playerBoxFits('Twitch', 479, 300)).toBe(false);
    expect(playerBoxFits('Twitch', 480, 299)).toBe(false);
    expect(playerBoxFits('YouTube', 0, 0)).toBe(true);
    expect(playerBoxFits('Kick', 100, 60)).toBe(true);
    expect(TWITCH_MIN_WIDTH).toBe(480);
    expect(TWITCH_MIN_HEIGHT).toBe(300);
  });

  it('R15 the words name no address and say only what is true', () => {
    for (const ended of ['expired', 'holder_changed', 'unconfirmed'] as const) {
      const note = hiddenStreamNote(ended);
      expect(note).not.toContain('http');
      expect(note).not.toContain('bc1');
    }
    expect(hiddenStreamNote('expired')).toContain('If you hold this block');
    const on = goLiveNotes(true);
    expect(on).toHaveLength(4);
    expect(on[1]).toContain('Twitch may show an ad or its own notice for mature games first');
    expect(on[2]).toContain('It may stay visible for a few minutes after a sale');
    expect(on[2]).toContain('blocks whose deed is recorded on this site');
    expect(on[2]).not.toMatch(/\d+\s+blocks?\b/);
    expect(on[3].startsWith('A feature of the Block Genomics site')).toBe(true);
    const off = goLiveNotes(false);
    expect(off).toHaveLength(3);
    for (const note of off) expect(note).not.toMatch(/play/i);
    for (const note of [...on, ...off]) expect(note).not.toContain('every block');
  });

  it('R16 a stream\'s identity is its player address and its start', () => {
    expect(streamIdentity({ embedUrl: 'e', startedAt: 's' })).toBe('e|s');
  });
});
