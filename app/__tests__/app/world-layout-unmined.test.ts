/**
 * SHIP-REPORT-bg87 adjacent gap 2: "`/world/980000` answers 200 with the
 * not-found body (soft 404, the `/world` sibling of #9). The same layout-level
 * fix applies." The /world/[height] segment now has the same layout as
 * /block/[height]: a bad or unmined height is a real 404 before anything renders.
 *
 * REVIEW-bg87 item 5: "The 404 pages emit two robots metas (`noindex` and
 * `noindex, nofollow`)". Next already writes `<meta name="robots"
 * content="noindex">` on every 404 it renders, so our not-found files must not
 * declare a second one.
 */

class NotFound extends Error {}
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('NEXT_NOT_FOUND');
  },
}));
jest.mock('@/components/SiteChrome', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/NotFoundContent', () => ({ __esModule: true, default: () => null }));

import WorldLayout from '@/app/(site)/world/[height]/layout';
import { KNOWN_MINED_HEIGHT } from '@/lib/block-summary';
import * as siteNotFound from '@/app/(site)/not-found';
import * as rootNotFound from '@/app/not-found';

const TIP = 972_700;
const fetchMock = jest.fn();
const layout = (height: string) => WorldLayout({ children: 'world', params: Promise.resolve({ height }) });

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => String(TIP) });
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

describe('/world/[height] layout', () => {
  it('answers 404 for an unmined height (980000)', async () => {
    await expect(layout('980000')).rejects.toBeInstanceOf(NotFound);
  });

  it('answers 404 for an unreadable height', async () => {
    await expect(layout('abc')).rejects.toBeInstanceOf(NotFound);
  });

  it('renders the tip block', async () => {
    await expect(layout(String(TIP))).resolves.toBe('world');
  });

  it('renders a mined block without asking mempool (718840)', async () => {
    await expect(layout('718840')).resolves.toBe('world');
    await expect(layout(String(KNOWN_MINED_HEIGHT))).resolves.toBe('world');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('not-found pages declare no robots meta of their own', () => {
  it.each([
    ['(site)/not-found', siteNotFound.metadata],
    ['root not-found', rootNotFound.metadata],
  ])('%s', (_name, metadata) => {
    expect(metadata.title).toBe('Not found | Block Genomics');
    expect(metadata).not.toHaveProperty('robots');
  });
});
