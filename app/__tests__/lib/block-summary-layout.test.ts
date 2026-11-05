/**
 * The block viewer paints its parcel layout once, from the real block summary,
 * and that layout is the canonical Bitmap picture.
 *
 * Block 612,888 (Gary, 2026-10-20) showed a first layout built from 25 real
 * transactions plus 1,089 synthesized sizes, then re-shuffled into a different
 * map when the paged real data landed: the layout is a pure function of its
 * per-tx input in block order, so it must be fed the real input from the first
 * frame. On 2026-11-04 Gary found the input itself was wrong: the squares were
 * sized by vbytes, while bitmap.land and Magic Eden size them by output value.
 * These tests pin that the summary converts into exactly the input the
 * canonical layout needs, and that the result is the oracle's picture.
 *
 * `generateParcels` lives in ParcelView, which pulls in three.js and cannot be
 * imported here (see parcel-view-no-invented-data.test.ts). Its layout input is
 * `{ index: p.txIndex, weight: squareSizes[i] }` with squareSizes =
 * txSatsToSizes(outSats) → mondrianLayout → packSquaresToWorldSpace(items,
 * BLOCK_SIZE = 20, TREEMAP_GAP = 0.15); the source guard at the bottom keeps
 * that wiring from drifting.
 */

import fs from 'fs';
import path from 'path';
import { summaryToRealBlock, type BlockSummaryPayload } from '@/lib/blockchainApi';
import { packSquaresToWorldSpace } from '@/lib/square-packing';
import { layoutBlock, txSatsToSizes } from '@/lib/bitmap-layout';
import { MondrianLayout } from '@/lib/vendor/ordpool/mondrian-layout';

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as BlockSummaryPayload;

const BLOCK_SIZE = 20;
const TREEMAP_GAP = 0.15;

/** What generateParcels hands mondrianLayout for a RealBlockData with every output total. */
function viewerLayout(block: ReturnType<typeof summaryToRealBlock>) {
  const sizes = txSatsToSizes(block.txs.map((tx) => tx.outSats as number));
  return packSquaresToWorldSpace(
    block.txs.map((tx, i) => ({ index: tx.txIndex, size: sizes[i] })),
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

  it('carries every output total (the layout input), the coinbase paying 12.5 BTC + fees', () => {
    expect(block.txs.map((t) => t.outSats)).toEqual(FIXTURE.value);
    expect(block.txs[0].outSats).toBeGreaterThan(12.5e8);
  });
});

describe('the viewer layout from the summary is the canonical layout', () => {
  const block = summaryToRealBlock(FIXTURE);

  it('equals the oracle packing of the value sizes (positions and sizes, tx order)', () => {
    const sizes = txSatsToSizes(FIXTURE.value as number[]);
    const oracle = new MondrianLayout(sizes);
    const layout = layoutBlock(FIXTURE.value as number[]);
    expect(layout.squares.map((q) => [q.x, q.y, q.size])).toEqual(
      oracle.slots.map((s) => [s.position.x, s.position.y, s.size]),
    );
    // World space is the same packing, fitted: every rect centre follows its square.
    const world = viewerLayout(block);
    const extent = Math.max(layout.width, layout.height);
    const cell = BLOCK_SIZE / extent;
    const offX = (extent - layout.width) / 2;
    world.forEach((r, i) => {
      const q = layout.squares[i];
      expect(r.x).toBeCloseTo((q.x + offX + q.size / 2) * cell - BLOCK_SIZE / 2, 9);
      expect(r.z).toBeCloseTo((q.y + q.size / 2) * cell - BLOCK_SIZE / 2, 9);
    });
  });

  it("puts the coinbase's 5 × 5 square at the top-left, like bitmap.land and Magic Eden", () => {
    const world = viewerLayout(block);
    const layout = layoutBlock(FIXTURE.value as number[]);
    expect(layout.squares[0]).toEqual({ index: 0, x: 0, y: 0, size: 5 });
    const cb = world[0];
    expect(cb.width).toBeCloseTo((5 * BLOCK_SIZE) / 50 - TREEMAP_GAP, 9);
    expect(cb.x - cb.width / 2).toBeLessThan(-BLOCK_SIZE / 2 + 1);
    expect(cb.z - cb.depth / 2).toBeLessThan(-BLOCK_SIZE / 2 + 0.1);
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

  it('generateParcels sizes squares by output value and packs them in tx-index order', () => {
    expect(SRC).toContain('outSats: tx.outSats,');
    expect(SRC).toContain('completeSatTotals(rawParcels.map(p => p.outSats))');
    expect(SRC).toContain('? txSatsToSizes(allSats)');
    expect(SRC).toContain('rawParcels.map((p, i) => ({ index: p.txIndex, weight: squareSizes[i] }))');
    expect(SRC).toContain('items.map(it => ({ index: it.index, size: it.weight }))');
    expect(SRC).toContain('mondrianLayout(treemapItems, BLOCK_SIZE, TREEMAP_GAP)');
    expect(SRC).toMatch(/const BLOCK_SIZE = 20;/);
    expect(SRC).toMatch(/const TREEMAP_GAP = 0\.15;/);
  });

  it('never sizes a parcel by bytes', () => {
    expect(SRC).not.toMatch(/vbytes:\s*p\.bytes/);
    expect(SRC).not.toMatch(/weight:\s*p\.bytes/);
  });

  it('loads the block through the summary hook, not the paged fetch', () => {
    expect(SRC).toContain('useBlockLayoutData(blockHeight)');
    expect(SRC).not.toMatch(/\bfetchFullBlock\b/);
  });
});
