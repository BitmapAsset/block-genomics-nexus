/**
 * The block page's scale line (lib/world-scale), in the Block facts tab since
 * bg98a (the hero carries the short scale chip on the art):
 * "2.1 km × 2.1 km · N parcels · mean lot ≈ M m", from the block's transaction
 * count, which the page already has (`data.chain.txCount`). The page never
 * fetches the block summary for it, so the line does not wait on, or race, a
 * 0.6-0.8 MB download; with no chain stats there is no line.
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
jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => ({ guardian: null, handle: null, degraded: false }) }));
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () =>
  function BlockTabs(p: { panels: Record<string, React.ReactNode> }) {
    return <div>{Object.entries(p.panels).map(([k, v]) => <div key={k}>{v}</div>)}</div>;
  },
);
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

import BlockPage from '@/app/(site)/block/[height]/page';
import * as worldScale from '@/lib/world-scale';

const HEIGHT = 612888;
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as { vsize: number[]; value: number[] };

const chain = (txCount: number) => ({
  height: HEIGHT,
  hash: HEIGHT.toString(16).padStart(64, '0'),
  timestamp: 1_577_836_800,
  txCount,
  size: 1_250_000,
  genome: '0123456789abcdef'.repeat(4),
});

const pageData = (over: Record<string, unknown> = {}) => ({
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
  chain: chain(FIXTURE.value.length),
  market: null,
  degraded: false,
  ...over,
});

const render = async () => renderToStaticMarkup(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));
const LINE = '2.1 km × 2.1 km · 1,114 parcels · mean lot ≈ 63 m';

beforeEach(() => {
  mockGetBlockSummary.mockReset();
  // A summary that never arrives: the page must not need it.
  mockGetBlockSummary.mockReturnValue(new Promise(() => {}));
  mockFetchBlockPageData.mockReset();
  mockFetchBlockPageData.mockResolvedValue(pageData());
});

it('the 612,888 fixture has one parcel per transaction (1,114)', () => {
  expect(FIXTURE.value).toHaveLength(1114);
});

it('prints the line from chain.txCount, once, in Block facts under the genome; the hero has the short chip', async () => {
  const html = await render();
  expect(html.split(LINE)).toHaveLength(2);
  // The <img> itself, not React's preload <link> hoisted to the top.
  const img = html.indexOf(`<img src="/api/v1/block-thumbnail/${HEIGHT}.png?v=3`);
  const genome = html.indexOf('block genome ');
  const line = html.indexOf(LINE);
  expect(img).toBeGreaterThan(-1);
  expect(genome).toBeGreaterThan(img);
  expect(line).toBeGreaterThan(genome);
  expect(html).toContain('2.1 km × 2.1 km · 1,114 parcels');
});

it('never calls getBlockSummary', async () => {
  await render();
  expect(mockGetBlockSummary).not.toHaveBeenCalled();
});

it('render time does not depend on the summary', async () => {
  const t0 = Date.now();
  const html = await render();
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(html).toContain(LINE);
});

it('chain: null → no line', async () => {
  mockFetchBlockPageData.mockResolvedValue(pageData({ chain: null }));
  const html = await render();
  expect(html).not.toContain('mean lot');
  expect(html).toContain(`${HEIGHT}.bitmap`);
});

it('scaleLineForTxCount matches the summary arithmetic', () => {
  const f = (worldScale as Record<string, unknown>).scaleLineForTxCount as ((n: number) => string) | undefined;
  expect(typeof f).toBe('function');
  if (!f) return;
  expect(f(1114)).toBe(LINE);
  expect(f(FIXTURE.value.length)).toBe(worldScale.scaleLine(worldScale.districtScaleFrom(HEIGHT, FIXTURE.value)));
  expect(f(2850)).toBe('2.1 km × 2.1 km · 2,850 parcels · mean lot ≈ 39 m');
  expect(f(3050)).toBe('2.1 km × 2.1 km · 3,050 parcels · mean lot ≈ 38 m');
  expect(f(2170)).toBe('2.1 km × 2.1 km · 2,170 parcels · mean lot ≈ 45 m');
});
