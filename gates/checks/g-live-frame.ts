// The page policy frames only the three player hosts, and every listed stream names a player on them.
import { jsonOf } from '../lib/chain.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

const FRAME_SRC = 'frame-src https://www.youtube.com https://player.twitch.tv https://player.kick.com;';
const PLAYER_ORIGINS = ['https://www.youtube.com', 'https://player.twitch.tv', 'https://player.kick.com'];

type List = { streams?: unknown; checking?: unknown };

export const gLiveFrame: Check = {
  id: 'G-LIVE-FRAME',
  promise: 'The page policy frames only the three player hosts, and every listed stream names a player on them.',
  group: 'promise',
  needs: [],
  notCovered: 'Whether a player plays, click to load, the switch and who may show a stream are not read: the check reads the page policy of three pages and the list of streams.',
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const fails: string[] = [];
    const frameRules: Record<string, string[]> = {};
    for (const path of [`/block/${ctx.heights[0]}`, `/world/${ctx.heights[0]}`, '/live']) {
      const page = await ctx.http.get(path);
      const csp = page.headers['content-security-policy'] ?? '';
      const frameParts = csp.split(';').map((p) => p.trim()).filter((p) => p.startsWith('frame-src') || p.startsWith('child-src'));
      frameRules[path] = frameParts;
      if (page.status !== 200) fails.push(`The page ${path} answered ${page.status}.`);
      if (frameParts.length !== 1 || `${frameParts[0]};` !== FRAME_SRC) fails.push(`The page policy's frame rule on ${path} is "${frameParts.join('; ')}"; the promise is "${FRAME_SRC}".`);
      if (!csp.includes("frame-ancestors 'none'")) fails.push(`The page policy on ${path} lets other sites frame the page.`);
    }
    const list = await ctx.http.get('/api/v1/livestream/active');
    const body = (jsonOf(list) ?? {}) as List;
    const rows = Array.isArray(body.streams) ? (body.streams as { embedUrl?: unknown }[]) : null;
    if (list.status !== 200 || rows === null || typeof body.checking !== 'number') fails.push(`The list of streams answered ${list.status}${list.status === 200 ? ' without streams and checking' : ''}.`);
    const offOrigin = (rows ?? []).filter((r) => {
      if (!String(r.embedUrl).startsWith('https://')) return true;
      try { return !PLAYER_ORIGINS.includes(new URL(String(r.embedUrl)).origin); } catch { return true; }
    }).length;
    if (offOrigin > 0) fails.push(`${offOrigin} listed stream(s) name a player address outside the three platforms.`);
    const values = { frameRules, streams: rows?.length ?? null, checking: body.checking ?? null, offOrigin };
    if (fails.length > 0) return { status: 'fail', reason: fails.join(' '), values };
    const listPart = rows !== null && rows.length > 0 ? `${rows.length} listed stream(s), all on them` : "the list is empty, so its part checked only the list's shape";
    return { status: 'pass', reason: `The page policy frames only the three player hosts on /block, /world and /live; ${listPart}.`, values };
  },
};
