/**
 * One tip read at a time per server: callers that arrive while `getTipHeight`
 * is reading join that read instead of starting their own, for a success and
 * for a failure. Once it settles, the memo rules of `tip-read-memo` apply
 * (a tip for 30 s, a failure for 15 s from when the read gave up).
 *
 * Also here: the reset seam for the tip memo, and `isSettledHeight`, which
 * counts a height at or below KNOWN_MINED_HEIGHT - 6 as settled without a tip.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

import {
  __resetTipMemoForTest,
  getTipHeight,
  isSettledHeight,
  KNOWN_MINED_HEIGHT,
  SETTLED_CONFIRMATIONS,
} from '@/lib/block-summary';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIP_URL = 'https://mempool.space/api/blocks/tip/height';

const okText = (t: string) => ({ ok: true, status: 200, headers: new Headers(), body: null, text: async () => t });
const down = () => ({ ok: false, status: 503, headers: new Headers(), body: null, text: async () => '' });

/** The tip endpoint holding every answer until `release()`. */
function slowTip(answer: () => unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = jest.fn(async (url: string) => {
    if (url !== TIP_URL) throw new Error(`unexpected ${url}`);
    await gate;
    return answer();
  });
  global.fetch = f as any;
  return { f, release };
}

let now = Date.parse('2032-01-01T00:00:00Z');

beforeEach(() => {
  __resetTipMemoForTest();
  now += 3_600_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('callers during a tip read share it', () => {
  it('5 callers during a slow read make 1 request and all get its tip; the tip is then remembered for 30 s', async () => {
    const { f, release } = slowTip(() => okText('980000'));
    const answers = Array.from({ length: 5 }, () => getTipHeight());
    release();
    expect(await Promise.all(answers)).toEqual([980_000, 980_000, 980_000, 980_000, 980_000]);
    expect(f).toHaveBeenCalledTimes(1);

    now += 29_000;
    expect(await getTipHeight()).toBe(980_000);
    expect(f).toHaveBeenCalledTimes(1);
    now += 2_000; // 31 s after the read started
    expect(await getTipHeight()).toBe(980_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an error answer', () => down()],
    ['a thrown request', () => Promise.reject(new Error('connect timeout'))],
  ])('5 callers during a slow failing read (%s) make 1 request and all get null; the failure is remembered for 15 s', async (_label, answer) => {
    const { f, release } = slowTip(answer);
    const answers = Array.from({ length: 5 }, () => getTipHeight());
    release();
    expect(await Promise.all(answers)).toEqual([null, null, null, null, null]);
    expect(f).toHaveBeenCalledTimes(1);

    now += 14_900;
    expect(await getTipHeight()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    now += 200; // 15.1 s after the read gave up
    await getTipHeight();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a failure counts from when the read gave up, not from when it started', async () => {
    const { f, release } = slowTip(() => down());
    const answer = getTipHeight();
    await Promise.resolve();
    now += 4_000; // the read gives up 4 s after it started
    release();
    expect(await answer).toBeNull();
    now += 14_000; // 18 s after the start, 14 s after giving up
    expect(await getTipHeight()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('__resetTipMemoForTest', () => {
  it('forgets a remembered tip', async () => {
    const { f, release } = slowTip(() => okText('980000'));
    release();
    expect(await getTipHeight()).toBe(980_000);
    __resetTipMemoForTest();
    expect(await getTipHeight()).toBe(980_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('forgets a remembered failure', async () => {
    const { f, release } = slowTip(() => down());
    release();
    expect(await getTipHeight()).toBeNull();
    __resetTipMemoForTest();
    await getTipHeight();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('forgets a read in flight: the next caller starts its own', async () => {
    const { f, release } = slowTip(() => okText('980000'));
    const first = getTipHeight();
    __resetTipMemoForTest();
    const second = getTipHeight();
    expect(f).toHaveBeenCalledTimes(2);
    release();
    expect(await Promise.all([first, second])).toEqual([980_000, 980_000]);
  });
});

describe('isSettledHeight', () => {
  it('is six confirmations', () => {
    expect(SETTLED_CONFIRMATIONS).toBe(6);
  });

  it('counts KNOWN_MINED_HEIGHT - 6 and below as settled without a tip', () => {
    expect(isSettledHeight(KNOWN_MINED_HEIGHT - 6, null)).toBe(true);
    expect(isSettledHeight(612_888, null)).toBe(true);
    expect(isSettledHeight(0, null)).toBe(true);
  });

  it('does not count KNOWN_MINED_HEIGHT - 5 and above as settled without a tip', () => {
    expect(isSettledHeight(KNOWN_MINED_HEIGHT - 5, null)).toBe(false);
    expect(isSettledHeight(KNOWN_MINED_HEIGHT - 3, null)).toBe(false);
    expect(isSettledHeight(KNOWN_MINED_HEIGHT + 500, null)).toBe(false);
  });

  it('with a tip, counts six confirmations and no fewer', () => {
    const tip = KNOWN_MINED_HEIGHT + 1_000;
    expect(isSettledHeight(tip - 6, tip)).toBe(true);
    expect(isSettledHeight(tip - 5, tip)).toBe(false);
    expect(isSettledHeight(tip, tip)).toBe(false);
    expect(isSettledHeight(KNOWN_MINED_HEIGHT - 3, KNOWN_MINED_HEIGHT + 3)).toBe(true);
    expect(isSettledHeight(KNOWN_MINED_HEIGHT - 3, KNOWN_MINED_HEIGHT + 2)).toBe(false);
  });
});
