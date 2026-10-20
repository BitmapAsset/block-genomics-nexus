/**
 * @jest-environment jsdom
 */

/**
 * The block viewer's loader. It used to paint three layouts on a cold load (a
 * mock block while loading, page 0 + a synthesized remainder, then 45 paged
 * calls of real data), each a different map. Gary saw the last two swap on
 * block 612,888. The normal path now paints once, from the real summary; the
 * estimate exists only as a labelled fallback that retries and cross-fades.
 */

import { act, renderHook } from '@testing-library/react';
import type { RealBlockData } from '@/lib/blockchainApi';

const mockFetchBlockSummary = jest.fn();
const mockFetchRealBlock = jest.fn();
jest.mock('@/lib/blockchainApi', () => ({
  fetchBlockSummary: (h: number) => mockFetchBlockSummary(h),
  fetchRealBlock: (h: number) => mockFetchRealBlock(h),
}));

import { useBlockLayoutData, LAYOUT_FADE_MS, SUMMARY_RETRY_MS } from '@/hooks/useBlockLayoutData';

function block(height: number, estimated: boolean): RealBlockData {
  return {
    height,
    hash: 'ab'.repeat(32),
    timestamp: 1579056000,
    txCount: 3,
    size: 900,
    weight: 3000,
    txs: [0, 1, 2].map((i) => ({
      txIndex: i,
      size: estimated ? 100 + i : 250 + i * 10,
      weight: 1000,
      fee: estimated && i > 0 ? null : i * 100,
      isCoinbase: i === 0,
      ...(estimated && i > 0 ? { estimated: true } : {}),
    })),
    estimated,
  };
}

/** Every distinct realBlock the component would have rendered, in order. */
function track(height: number) {
  const seen: Array<RealBlockData | null> = [];
  const hook = renderHook(({ h }) => {
    const r = useBlockLayoutData(h);
    if (seen[seen.length - 1] !== r.realBlock) seen.push(r.realBlock);
    return r;
  }, { initialProps: { h: height } });
  return { ...hook, seen };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchBlockSummary.mockReset();
  mockFetchRealBlock.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('normal path: summary available', () => {
  it('paints once from the real summary: loading, then live, nothing in between', async () => {
    const live = block(612888, false);
    mockFetchBlockSummary.mockResolvedValue(live);
    const { result, seen } = track(612888);

    expect(result.current.dataSource).toBe('loading');
    await flush();

    expect(result.current.realBlock).toBe(live);
    expect(result.current.dataSource).toBe('real');
    expect(result.current.retrying).toBe(false);
    expect(seen).toEqual([null, live]);
    expect(mockFetchRealBlock).not.toHaveBeenCalled();
  });

  it('does not change when the same block is loaded twice', async () => {
    const live = block(612888, false);
    mockFetchBlockSummary.mockResolvedValue(live);
    const first = track(612888);
    await flush();
    first.unmount();

    const second = track(612888);
    await flush();
    await act(async () => { jest.advanceTimersByTime(SUMMARY_RETRY_MS * 3); });

    expect(second.seen).toEqual([null, live]);
    expect(second.result.current.realBlock?.txs).toEqual(first.result.current.realBlock?.txs);
    expect(mockFetchRealBlock).not.toHaveBeenCalled();
  });

  it('a new height resets to loading and paints that block once', async () => {
    const a = block(1, false);
    const b = block(2, false);
    mockFetchBlockSummary.mockImplementation(async (h: number) => (h === 1 ? a : b));
    const { result, rerender, seen } = track(1);
    await flush();
    rerender({ h: 2 });
    expect(result.current.dataSource).toBe('loading');
    await flush();
    expect(result.current.realBlock).toBe(b);
    expect(seen).toEqual([null, a, null, b]);
  });
});

describe('fallback: summary unavailable', () => {
  it('shows the labelled estimate, retries on its own, and cross-fades to the real block', async () => {
    const estimate = block(700000, true);
    const live = block(700000, false);
    mockFetchBlockSummary.mockResolvedValueOnce(null).mockResolvedValue(live);
    mockFetchRealBlock.mockResolvedValue(estimate);
    const { result, seen } = track(700000);
    await flush();

    expect(result.current.realBlock).toBe(estimate);
    expect(result.current.realBlock?.estimated).toBe(true);
    expect(result.current.retrying).toBe(true);

    await act(async () => { jest.advanceTimersByTime(SUMMARY_RETRY_MS); });
    await flush();
    // Fading out: still the estimate on screen, swap pending.
    expect(result.current.swapping).toBe(true);
    expect(result.current.realBlock).toBe(estimate);

    await act(async () => { jest.advanceTimersByTime(LAYOUT_FADE_MS); });
    expect(result.current.realBlock).toBe(live);
    expect(result.current.swapping).toBe(false);
    expect(result.current.retrying).toBe(false);
    expect(seen).toEqual([null, estimate, live]);
    expect(2 * LAYOUT_FADE_MS).toBeGreaterThanOrEqual(400);
  });

  it('manual retry fetches the summary immediately', async () => {
    const estimate = block(700001, true);
    const live = block(700001, false);
    mockFetchBlockSummary.mockResolvedValueOnce(null).mockResolvedValue(live);
    mockFetchRealBlock.mockResolvedValue(estimate);
    const { result } = track(700001);
    await flush();
    expect(mockFetchBlockSummary).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await flush();
    expect(mockFetchBlockSummary).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(LAYOUT_FADE_MS); });
    expect(result.current.realBlock).toBe(live);
  });

  it('falls back to mock only when both the summary and the estimate fail', async () => {
    mockFetchBlockSummary.mockResolvedValue(null);
    mockFetchRealBlock.mockResolvedValue(null);
    const { result } = track(700002);
    await flush();
    expect(result.current.realBlock).toBeNull();
    expect(result.current.dataSource).toBe('mock');
    expect(result.current.retrying).toBe(true);
  });

  it('stops retrying after unmount', async () => {
    mockFetchBlockSummary.mockResolvedValue(null);
    mockFetchRealBlock.mockResolvedValue(block(700003, true));
    const { unmount } = track(700003);
    await flush();
    unmount();
    await act(async () => { jest.advanceTimersByTime(SUMMARY_RETRY_MS * 5); });
    expect(mockFetchBlockSummary).toHaveBeenCalledTimes(1);
  });
});
