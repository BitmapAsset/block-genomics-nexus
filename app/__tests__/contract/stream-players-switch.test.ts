/**
 * The stream players switch (NEXT_PUBLIC_BG_STREAM_PLAYERS) and the one place a player frame is made.
 *
 * Unset or exactly "on": a visitor's click plays a stream in its player; any other value turns every player into a
 * plain link. Only components/nexus/StreamPlayer.tsx makes a player frame and reads the switch. The block page and
 * /live cannot be imported by a suite (three.js, the wallet), so their sources are read as text.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const src = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Every .ts and .tsx file under src, as paths relative to it with '/' separators. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(SRC, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function filesContaining(needle: string | RegExp): string[] {
  return sourceFiles().filter((rel) => {
    const text = src(rel);
    return typeof needle === 'string' ? text.includes(needle) : needle.test(text);
  });
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function flagValue(env: string | undefined): boolean {
  const saved = process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS;
  if (env === undefined) delete process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS;
  else process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS = env;
  let value: unknown;
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      value = require('@/lib/stream-players-flag').STREAM_PLAYERS_ON;
    });
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS;
    else process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS = saved;
  }
  return value as boolean;
}

const PLAYER = 'components/nexus/StreamPlayer.tsx';
const PV = 'components/nexus/ParcelView.tsx';
const LIVE = 'app/(site)/live/page.tsx';

describe('stream players switch', () => {
  it('S1 the switch is on unset or "on" and off for every other value', () => {
    expect(flagValue(undefined)).toBe(true);
    expect(flagValue('on')).toBe(true);
    expect(flagValue('off')).toBe(false);
    expect(flagValue('')).toBe(false);
    expect(flagValue('ON')).toBe(false);
    expect(flagValue('true')).toBe(false);
    expect(flagValue('1')).toBe(false);
  });

  it('S2 only the player component makes a frame and only it reads the switch', () => {
    expect(filesContaining('NEXT_PUBLIC_BG_STREAM_PLAYERS')).toEqual(['lib/stream-players-flag.ts']);
    expect(filesContaining(/from\s+['"][^'"]*stream-players-flag['"]/)).toEqual([PLAYER]);
    expect(filesContaining('<iframe')).toEqual([PLAYER]);
    expect(filesContaining("'iframe'").filter((f) => f !== PLAYER)).toEqual([]);
    expect(filesContaining('"iframe"').filter((f) => f !== PLAYER)).toEqual([]);
    expect(filesContaining('playerFrameSrc(')).toEqual([PLAYER, 'lib/stream-embed.ts'].sort());
  });

  it('S3 the block page and /live use the player and the reads, and nothing made up', () => {
    const pv = src(PV);
    for (const gone of ['streamViewerCount', "console.log('[Stream]", 'streamEmbedUrl', 'setStreamRead', 'lastLive', 'nextStreamRead']) {
      expect([gone, count(pv, gone)]).toEqual([gone, 0]);
    }
    const pvOnce: [string, number][] = [
      ['<StreamPlayer', 1],
      ['goLiveNotes(PLAYERS_ON).map(', 1],
      ['<button type="button" onClick={() => setStreamPanelOpen(true)}', 1],
      ['data-testid="stream-chip"', 1],
      ['window.innerWidth < 640', 1],
      ['hiddenStreamNote(read.ended)', 1],
      ['parseStreamRead(', 1],
      ['nextPageStream(', 2],
      ['blockPageAskDelay(page)', 1],
      ['document.hidden', 1],
      ['return data?.error ||', 2],
      ["{shownStream.status === 'ended' ? 'ENDED' : 'LIVE'}", 1],
      ["{PLAYERS_ON ? 'player below' : 'link below'}", 1],
      ["!showLivestreamModal && panelSize === 'hidden' && (", 1],
      ['else setStarted(false);', 1],
      ['if (seq !== readSeq.current) return;', 1],
      ["read={page.height === blockHeight ? page.read : { kind: 'none' }}", 1],
      ["{started && read.kind === 'none' && (", 1],
    ];
    for (const [needle, n] of pvOnce) expect([needle, count(pv, needle)]).toEqual([needle, n]);

    const live = src(LIVE);
    expect(count(live, 'LIST_RECHECK')).toBe(0);
    const liveOnce: [string, number][] = [
      ['<StreamPlayer', 1],
      ['recheckDelay(rechecks.current)', 1],
      ['if (n === 0) rechecks.current = 0;', 1],
      ['document.hidden', 2],
      ['liveCardStatus(stream, ended, unsure, now)', 1],
      ['if (inFlight.current.has(id)) return;', 1],
      ['if (!keepPlayingCard(read, id)) {', 1],
      ['for (const c of incoming) next.delete(streamIdentity(c));', 1],
      ['xl:grid-cols-2', 1],
      ['max-w-[720px] xl:max-w-none', 1],
      ["{status === 'ended' ? 'ENDED' : 'LIVE'}", 1],
    ];
    for (const [needle, n] of liveOnce) expect([needle, count(live, needle)]).toEqual([needle, n]);
    let at = live.indexOf('<Link');
    while (at !== -1) {
      const close = live.indexOf('</Link>', at);
      const inside = close === -1 ? live.slice(at) : live.slice(at, close);
      expect(inside).not.toContain('<StreamPlayer');
      at = live.indexOf('<Link', at + 1);
    }
  });

  it('S4 the player takes its size from its container; the panel gives it 520 px on desktop and the full width on a phone', () => {
    const player = src(PLAYER);
    expect(player).toContain("aspectRatio: '16 / 10'");
    expect(player).toContain('className="w-full"');
    expect(player).not.toMatch(/w-\[\d+px\]/);
    expect(player).not.toMatch(/width:\s*\d/);
    const pv = src(PV);
    expect(pv).toContain('inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-[68px] sm:right-4 sm:w-[520px]');
    expect(count(pv, '<div className="h-[60px] sm:hidden" aria-hidden="true" />')).toBe(1);
    expect(count(pv, "paddingBottom: 'env(safe-area-inset-bottom, 0px)'")).toBe(1);
    expect(count(pv, "bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))'")).toBe(1);
    expect(count(pv, 'data-testid="stream-panel-close"')).toBe(1);
    for (const testid of ['data-testid="stream-chip"', 'data-testid="stream-panel-close"']) {
      const at = pv.indexOf(testid);
      expect(at).not.toBe(-1);
      const element = pv.slice(at, pv.indexOf('</button>', at));
      expect([testid, element.includes('min-h-[44px] min-w-[44px]')]).toEqual([testid, true]);
    }
  });

  it('S5 the pages hand the player its status, keep what plays, count each re-ask, close the panel and count only live cards', () => {
    const pv = src(PV);
    const pvOnce: [string, number][] = [
      ['status={shownStream.status} />', 1],
      ['setPage(prev => nextPageStream(prev, answer, Date.now(), blockHeight));', 1],
      ['{shownStream && streamPanelOpen && !showLivestreamModal && (', 1],
      ['onClick={() => setStreamPanelOpen(false)}', 1],
      ['setPage(prev => endPastTwelveHours(prev, Date.now()));', 1],
    ];
    for (const [needle, n] of pvOnce) expect([needle, count(pv, needle)]).toEqual([needle, n]);
    const live = src(LIVE);
    const liveOnce: [string, number][] = [
      ['rechecks.current += 1;', 1],
      ['mergeLiveList(shown.current, incoming, playing.current, endedRef.current)', 1],
      ['onPlay={() => { playing.current.add(id); }}', 1],
      ["liveCardStatus(s, ended, unsure, now) !== 'ended'", 1],
      ['const totalLive = liveStreamCount + games.length;', 1],
      ['count: liveStreamCount }', 1],
      [') : streams.length + games.length === 0 ? (', 1],
    ];
    for (const [needle, n] of liveOnce) expect([needle, count(live, needle)]).toEqual([needle, n]);
  });
});
