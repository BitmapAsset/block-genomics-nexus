/**
 * `getTipHeight` remembers its answer: a read tip for 30 s, a failed read for
 * 15 s. While mempool.space is unreachable, callers in that window get `null`
 * at once instead of each waiting for the 5 s tip timeout; after 15 s the next
 * call asks again. A success after a failure uses the 30 s memo as before.
 *
 * Time is driven through `Date.now`; each case starts an hour after the last,
 * past both memo windows.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

import { getTipHeight, isAboveTip } from '@/lib/block-summary';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIP_URL = 'https://mempool.space/api/blocks/tip/height';

const okText = (t: string) => ({ ok: true, status: 200, headers: new Headers(), body: null, text: async () => t });
const down = () => ({ ok: false, status: 503, headers: new Headers(), body: null, text: async () => '' });

/** The tip endpoint answering from a queue of modes; the last mode repeats. */
function tipHost(...modes: Array<'ok' | 'fail' | 'throw' | 'junk'>) {
  const f = jest.fn(async (url: string) => {
    if (url !== TIP_URL) throw new Error(`unexpected ${url}`);
    const mode = modes.length > 1 ? modes.shift()! : modes[0];
    if (mode === 'throw') throw new Error('connect timeout');
    if (mode === 'fail') return down();
    if (mode === 'junk') return okText('not a height');
    return okText('980000');
  });
  global.fetch = f as any;
  return f;
}

let now = Date.parse('2031-01-01T00:00:00Z');

beforeEach(() => {
  now += 3_600_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('a failed tip read is remembered for 15 s', () => {
  it.each(['fail', 'throw', 'junk'] as const)('after a %s read, two calls within 15 s make one upstream attempt', async (mode) => {
    const f = tipHost(mode, 'ok');
    expect(await getTipHeight()).toBeNull();
    now += 5_000;
    expect(await getTipHeight()).toBeNull();
    now += 9_900; // 14.9 s after the failure
    expect(await getTipHeight()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('after 15 s it asks again, and a success is then remembered for 30 s', async () => {
    const f = tipHost('fail', 'ok');
    expect(await getTipHeight()).toBeNull();
    now += 15_001;
    expect(await getTipHeight()).toBe(980_000);
    expect(f).toHaveBeenCalledTimes(2);
    now += 29_000;
    expect(await getTipHeight()).toBe(980_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a failure after the 30 s memo ran out answers null, not the old tip, and is remembered', async () => {
    const f = tipHost('ok', 'fail', 'ok');
    expect(await getTipHeight()).toBe(980_000);
    now += 30_001;
    expect(await getTipHeight()).toBeNull();
    now += 10_000;
    expect(await getTipHeight()).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('isAboveTip refuses nothing while the failure is remembered, and asks upstream once', async () => {
    const f = tipHost('throw');
    expect(await isAboveTip(990_000)).toBe(false);
    now += 1_000;
    expect(await isAboveTip(990_000)).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
