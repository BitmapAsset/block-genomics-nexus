/**
 * `/block/[height]` for a height that has not been mined yet (QA scorecard
 * 2026-10-22 row #9). `/block/980000` used to answer 200 with a full block page
 * ("Walk through 980000.bitmap…") and an indexable share card, for every height
 * above the tip. A height above mempool's tip now calls notFound() (Next's
 * not-found page with noindex), the same rule the block summary API applies. When the tip cannot be read the page
 * renders as before, so a mempool outage never hides a real block.
 */

const mockTip = jest.fn();
jest.mock('@/lib/block-summary', () => ({
  getTipHeight: (...a: unknown[]) => mockTip(...(a as [])),
  // The page asks through isAboveTip; keep it on the mocked tip here. The
  // known-mined shortcut is covered in block-layout-unmined.test.ts.
  isAboveTip: async (h: number) => {
    const t = await mockTip();
    return t !== null && h > t;
  },
}));

const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
  describeBlock: () => 'Unclaimed',
  creatorLabel: () => '',
  displayOwner: () => null,
}));

jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => null }));

// Client islands of the page; only the server logic is under test here.
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);

class NotFound extends Error {}
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('NEXT_NOT_FOUND');
  },
}));

import BlockPage, { generateMetadata } from '@/app/(site)/block/[height]/page';

const TIP = 972_600;
const props = (height: string) => ({ params: Promise.resolve({ height }) });

beforeEach(() => {
  mockTip.mockReset();
  mockFetchBlockPageData.mockReset();
  mockFetchBlockPageData.mockResolvedValue({ height: 0, chain: null, objects: [], market: null });
});

describe('/block/[height] above the chain tip', () => {
  it('metadata answers 404 for a height that is not mined yet', async () => {
    mockTip.mockResolvedValue(TIP);
    await expect(generateMetadata(props('980000'))).rejects.toBeInstanceOf(NotFound);
  });

  it('the page answers 404 for a height that is not mined yet', async () => {
    mockTip.mockResolvedValue(TIP);
    await expect(BlockPage(props('980000'))).rejects.toBeInstanceOf(NotFound);
  });

  it('keeps a mined block page unchanged (718840)', async () => {
    mockTip.mockResolvedValue(TIP);
    const meta = await generateMetadata(props('718840'));
    expect(meta.title).toBe('Block 718,840 — 718840.bitmap | Block Genomics');
    expect(meta.openGraph?.images).toEqual([
      { url: '/og/block/718840', width: 1200, height: 630, alt: 'Bitcoin block 718840 genome card' },
    ]);
  });

  it('the tip block itself is a page', async () => {
    mockTip.mockResolvedValue(TIP);
    await expect(generateMetadata(props(String(TIP)))).resolves.toHaveProperty('title');
  });

  it('renders as before when the tip cannot be read', async () => {
    mockTip.mockResolvedValue(null);
    await expect(generateMetadata(props('980000'))).resolves.toHaveProperty('title');
  });
});
