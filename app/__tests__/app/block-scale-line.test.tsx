/**
 * The block page's scale line under the map (lib/world-scale):
 * "2.1 km × 2.1 km · N parcels · mean lot ≈ M m", from the block summary, and
 * left out (never an error) when the summary fails or is slow.
 */

import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/block-events', () => ({ listBlockEvents: async () => ({ enabled: false, events: [] }) }));

const mockGetBlockSummary = jest.fn();
jest.mock('@/lib/block-summary', () => ({
  getTipHeight: async () => 972_600,
  isAboveTip: async () => false,
  getBlockSummary: (...a: unknown[]) => mockGetBlockSummary(...a),
}));

const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  ...jest.requireActual('@/lib/blockPageData'),
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
}));
jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => ({ guardian: null }) }));
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => () => null);

import BlockPage from '@/app/(site)/block/[height]/page';

const HEIGHT = 612888;
const VSIZE = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8')) as { vsize: number[] }
).vsize;

const pageData = {
  height: HEIGHT,
  claimed: false,
  label: null,
  ownership: { onChainOwner: null, registeredOwner: null, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false },
  objects: [],
  objectCount: 0,
  parcels: [],
  parcelCount: 0,
  experiences: [],
  experienceCount: 0,
  chain: null,
  market: null,
  degraded: false,
};

const render = async () => renderToStaticMarkup(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));
const LINE = '2.1 km × 2.1 km · 1,114 parcels · mean lot ≈ 63 m';

beforeEach(() => {
  mockGetBlockSummary.mockReset();
  mockFetchBlockPageData.mockReset();
  mockFetchBlockPageData.mockResolvedValue(pageData);
});

it('prints the scale line once, right under the block map', async () => {
  mockGetBlockSummary.mockResolvedValue({ height: HEIGHT, vsize: VSIZE });
  const html = await render();
  expect(html.split(LINE)).toHaveLength(2);
  const img = html.indexOf(`/api/v1/block-thumbnail/${HEIGHT}.png`);
  const line = html.indexOf(LINE);
  expect(img).toBeGreaterThan(-1);
  expect(line).toBeGreaterThan(img);
  expect(html.slice(img, line)).not.toContain('<h1');
  expect(mockGetBlockSummary).toHaveBeenCalledWith(HEIGHT);
});

it('leaves the line out when the summary fails', async () => {
  mockGetBlockSummary.mockRejectedValue(new Error('mempool down'));
  const html = await render();
  expect(html).not.toContain('mean lot');
  expect(html).toContain(`${HEIGHT}.bitmap`);
});

it('leaves the line out when the summary is slow, without holding the page', async () => {
  mockGetBlockSummary.mockReturnValue(new Promise(() => {}));
  const t0 = Date.now();
  const html = await render();
  expect(Date.now() - t0).toBeLessThan(5000);
  expect(html).not.toContain('mean lot');
});
