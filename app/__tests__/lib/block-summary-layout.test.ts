/**
 * The block viewer paints its parcel layout once, from the real block summary.
 *
 * Block 612,888 (Gary, 2026-10-20) showed a first layout built from 25 real
 * transactions plus 1,089 synthesized sizes, then re-shuffled into a different
 * map when the paged real data landed. The layout is a pure function of per-tx
 * vsize in block order (bitfeed packer), so the only fix is to feed it the real
 * sizes from the first frame. These tests pin that the summary converts into
 * exactly the input the canonical packer needs, and that the result is the
 * canonical map recorded in research/layout-2026-10-20/TRUTH.md.
 *
 * `generateParcels` lives in ParcelView, which pulls in three.js and cannot be
 * imported here (see parcel-view-no-invented-data.test.ts). Its layout input is
 * `{ index: tx.txIndex, weight: tx.size }` → mondrianLayout →
 * packSquaresToWorldSpace(items, BLOCK_SIZE = 20, TREEMAP_GAP = 0.15); the
 * source guard at the bottom keeps that wiring from drifting.
 */

import fs from 'fs';
import path from 'path';
import { summaryToRealBlock, type BlockSummaryPayload } from '@/lib/blockchainApi';
import { packSquares, packSquaresToWorldSpace } from '@/lib/square-packing';

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as BlockSummaryPayload;

const BLOCK_SIZE = 20;
const TREEMAP_GAP = 0.15;

/** What generateParcels hands mondrianLayout for a RealBlockData. */
function viewerLayout(block: ReturnType<typeof summaryToRealBlock>) {
  return packSquaresToWorldSpace(
    block.txs.map((tx) => ({ index: tx.txIndex, vbytes: tx.size })),
    BLOCK_SIZE,
    TREEMAP_GAP,
  );
}

describe('summaryToRealBlock (block 612,888)', () => {
  const block = summaryToRealBlock(FIXTURE);

  it('is the whole block, real, in block order', () => {
    expect(block.estimated).toBe(false);
    expect(block.txCount).toBe(1114);
    expect(block.txs).toHaveLength(1114);
    expect(block.txs.map((t) => t.txIndex)).toEqual(FIXTURE.vsize.map((_, i) => i));
    expect(block.txs.every((t) => t.estimated !== true)).toBe(true);
    expect(block.txs[0].isCoinbase).toBe(true);
    expect(block.txs.filter((t) => t.isCoinbase)).toHaveLength(1);
  });

  it('carries the block facts the panel prints', () => {
    expect(block.hash).toBe(FIXTURE.hash);
    expect(block.size).toBe(400950);
    expect(block.weight).toBe(1211757);
    // VBYTES row: Σ ceil(weight/4), the figure the "Live" screen showed after
    // the old paged fetch, never the 337,112 of the estimate.
    expect(block.txs.reduce((s, t) => s + t.size, 0)).toBe(303480);
  });

  it('keeps real fees (a zero-fee coinbase is a fact, not unknown)', () => {
    expect(block.txs[0].fee).toBe(0);
    expect(block.txs.every((t) => typeof t.fee === 'number')).toBe(true);
  });
});

describe('the viewer layout from the summary is the canonical layout', () => {
  const block = summaryToRealBlock(FIXTURE);

  it('equals the packer run on summary vsize in index order (positions and sizes)', () => {
    const canonical = packSquaresToWorldSpace(
      FIXTURE.vsize.map((vbytes, index) => ({ index, vbytes })),
      BLOCK_SIZE,
      TREEMAP_GAP,
    );
    expect(viewerLayout(block)).toEqual(canonical);
  });

  it('is the 41×41 map recorded in TRUTH.md, big squares in the lower half', () => {
    const { squares, gridWidth } = packSquares(block.txs.map((t) => ({ index: t.txIndex, vbytes: t.size })));
    expect(gridWidth).toBe(41);
    const big = squares.filter((s) => s.size >= 4).map((s) => [s.index, s.x, s.y, s.size]);
    expect(big).toEqual([
      [641, 33, 17, 7],
      [897, 18, 27, 7],
      [902, 29, 27, 7],
      [1031, 6, 33, 6],
      [1033, 15, 34, 4],
      [1039, 19, 34, 6],
      [1096, 26, 37, 6],
    ]);
  });

  it('is identical across two conversions and two layouts of the same data', () => {
    const again = summaryToRealBlock(JSON.parse(JSON.stringify(FIXTURE)));
    expect(viewerLayout(again)).toEqual(viewerLayout(block));
  });
});

describe('ParcelView wiring (source guard)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'components', 'nexus', 'ParcelView.tsx'),
    'utf8',
  );

  it('generateParcels feeds the packer tx.size in tx-index order', () => {
    expect(SRC).toContain('bytes: tx.size,');
    expect(SRC).toContain('rawParcels.map(p => ({ index: p.txIndex, weight: p.bytes }))');
    expect(SRC).toContain('mondrianLayout(treemapItems, BLOCK_SIZE, TREEMAP_GAP)');
    expect(SRC).toMatch(/const BLOCK_SIZE = 20;/);
    expect(SRC).toMatch(/const TREEMAP_GAP = 0\.15;/);
  });

  it('loads the block through the summary hook, not the paged fetch', () => {
    expect(SRC).toContain('useBlockLayoutData(blockHeight)');
    expect(SRC).not.toMatch(/\bfetchFullBlock\b/);
  });
});
