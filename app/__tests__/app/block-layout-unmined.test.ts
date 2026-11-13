/**
 * QA 2026-10-22 #9 (the partial left by bg86): /block/980000 answered 200 with
 * a noindex not-found body, because the segment's loading.tsx streams the shell
 * (and the status line) before the page's tip check runs. The check now also
 * runs in the segment layout, above that boundary, so the status is a real 404.
 * Mined heights at or below KNOWN_MINED_HEIGHT never wait for mempool.
 */

class NotFound extends Error {}
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('NEXT_NOT_FOUND');
  },
}));

// The layout hints the hero picture to the browser from the first bytes of the response.
const mockPreload = jest.fn();
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  preload: (...a: unknown[]) => mockPreload(...a),
}));

import BlockLayout from '@/app/(site)/block/[height]/layout';
import { KNOWN_MINED_HEIGHT, isAboveTip } from '@/lib/block-summary';
import { bitmapThumbnailUrl } from '@/lib/bitmap-layout';

const TIP = 972_700;
const fetchMock = jest.fn();
const layout = (height: string) => BlockLayout({ children: 'page', params: Promise.resolve({ height }) });

beforeEach(() => {
  jest.resetModules();
  fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => String(TIP) });
  mockPreload.mockReset();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

describe('/block/[height] layout', () => {
  it('answers 404 above the tip, before the loading boundary', async () => {
    await expect(layout('980000')).rejects.toBeInstanceOf(NotFound);
  });

  it('renders the tip block', async () => {
    await expect(layout(String(TIP))).resolves.toBe('page');
  });

  it('does not ask mempool about a mined block (718840)', async () => {
    await expect(layout('718840')).resolves.toBe('page');
    await expect(layout(String(KNOWN_MINED_HEIGHT))).resolves.toBe('page');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still 404s an unreadable height', async () => {
    await expect(layout('abc')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('/block/[height] layout hero preload', () => {
  it('preloads exactly the hero picture, high priority, for a valid height', async () => {
    await expect(layout('612888')).resolves.toBe('page');
    expect(mockPreload).toHaveBeenCalledTimes(1);
    expect(mockPreload).toHaveBeenCalledWith(bitmapThumbnailUrl(612888), { as: 'image', fetchPriority: 'high' });
    expect(bitmapThumbnailUrl(612888)).toBe('/api/v1/block-thumbnail/612888.png?v=3');
  });

  it('preloads the tip block too', async () => {
    await expect(layout(String(TIP))).resolves.toBe('page');
    expect(mockPreload).toHaveBeenCalledWith(bitmapThumbnailUrl(TIP), { as: 'image', fetchPriority: 'high' });
  });

  it('does not preload anything for a 404 height', async () => {
    await expect(layout('980000')).rejects.toBeInstanceOf(NotFound);
    await expect(layout('abc')).rejects.toBeInstanceOf(NotFound);
    expect(mockPreload).not.toHaveBeenCalled();
  });
});

describe('isAboveTip when mempool is down', () => {
  it('never hides a block', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    // A fresh module so the 30 s tip memo from the tests above does not answer.
    const fresh = jest.requireActual('@/lib/block-summary') as { isAboveTip: typeof isAboveTip };
    await expect(fresh.isAboveTip(990_000)).resolves.toBe(false);
  });
});
