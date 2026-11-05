/**
 * World scale (lib/world-scale): block 612,888 as a 2.1 km × 2.1 km district,
 * from the recorded mempool summary (per-tx output totals, `value`).
 *
 * Parcels are the canonical Bitmap squares (lib/bitmap-layout), the picture
 * bitmap.land and Magic Eden draw: 47 × 50 cells on 612,888, the larger side
 * spanning 2,100 m, so a cell is 42 m square and the content is centred
 * east-west with a 1.5-cell margin each side.
 */

jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return { ...actual, getBlockSummary: jest.fn() };
});

import fs from 'fs';
import path from 'path';
import { getBlockSummary } from '@/lib/block-summary';
import { layoutBlock } from '@/lib/bitmap-layout';
import { MondrianLayout } from '@/lib/vendor/ordpool/mondrian-layout';
import {
  BLOCK_AREA_M2,
  BLOCK_EDGE_M,
  HEIGHT_CAP_M,
  WORLD_SCALE,
  districtScale,
  districtScaleFrom,
  layoutOf,
  parcelDimensions,
  parcelDimensionsFrom,
  parcelRectsFrom,
  scaleLine,
} from '@/lib/world-scale';

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as { height: number; vsize: number[]; value: number[] };
const SATS = FIXTURE.value;

describe('WORLD_SCALE constants', () => {
  it('is a 2,100 m square of 4.41 km²', () => {
    expect(BLOCK_EDGE_M).toBe(2100);
    expect(BLOCK_AREA_M2).toBe(4_410_000);
    expect(BLOCK_EDGE_M * BLOCK_EDGE_M).toBe(BLOCK_AREA_M2);
    expect(WORLD_SCALE.SATS_LOG10_OFFSET).toBe(5);
    expect(HEIGHT_CAP_M).toBe(300);
  });
});

describe('block 612,888', () => {
  const s = districtScaleFrom(612888, SATS);
  const rects = parcelRectsFrom(SATS);
  const oracle = new MondrianLayout(layoutBlock(SATS).sizes);

  it('has 1,114 parcels and a mean lot of 3,959 m² (≈ 63 m)', () => {
    expect(s.parcels).toBe(1114);
    expect(Math.abs(s.mean_lot_m2 - 3959)).toBeLessThanOrEqual(1);
    expect(s.mean_lot_edge_m).toBeCloseTo(62.9, 1);
    expect(s.edge_m).toBe(2100);
    expect(s.area_m2).toBe(4_410_000);
    expect(s.height_cap_m).toBe(300);
  });

  it('fits the canonical 47 × 50 layout onto the square with 42 m square cells', () => {
    expect([s.grid.cols, s.grid.rows]).toEqual([oracle.width, oracle.height]);
    expect(s.grid).toEqual({ cols: 47, rows: 50, cell_x_m: 42, cell_y_m: 42 });
    const layout = layoutOf(SATS);
    expect(layout.squares.map((q) => [q.x, q.y, q.size])).toEqual(oracle.slots.map((q) => [q.position.x, q.position.y, q.size]));
  });

  it('puts every parcel inside the square, each one square', () => {
    expect(rects).toHaveLength(1114);
    for (const r of rects) {
      expect(r.x_m).toBeGreaterThanOrEqual(0);
      expect(r.y_m).toBeGreaterThanOrEqual(0);
      expect(r.x_m + r.w_m).toBeLessThanOrEqual(BLOCK_EDGE_M + 1e-6);
      expect(r.y_m + r.h_m).toBeLessThanOrEqual(BLOCK_EDGE_M + 1e-6);
      expect(r.w_m).toBeCloseTo(r.h_m, 9);
      expect(r.area_m2).toBeCloseTo(r.w_m * r.h_m, 6);
    }
  });

  it('never overlaps two parcels', () => {
    const { squares, contentWidth, gridHeight } = layoutOf(SATS);
    const seen = new Uint8Array(contentWidth * gridHeight);
    for (const q of squares) {
      for (let y = q.y; y < q.y + q.size; y++) {
        for (let x = q.x; x < q.x + q.size; x++) {
          expect(seen[y * contentWidth + x]).toBe(0);
          seen[y * contentWidth + x] = 1;
        }
      }
    }
  });

  it('sums to 4.41 km²: parcels plus the open cells and margin, to rounding', () => {
    const parcels = rects.reduce((sum, r) => sum + r.area_m2, 0);
    expect(Math.abs(parcels - s.parcel_area_m2)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.parcel_area_m2 + s.open_area_m2 - BLOCK_AREA_M2)).toBeLessThanOrEqual(1);
    // 2,209 of the 2,500 cells (50 × 50) are parcels: 88.4 % of the district.
    expect(s.parcel_area_m2).toBe(3_896_676);
    expect(s.open_area_m2).toBe(513_324);
  });

  it('gives the coinbase its 5 × 5 square in the top-left corner (210 m)', () => {
    expect(parcelDimensionsFrom(SATS, 0)).toEqual({ index: 0, x_m: 63, y_m: 0, w_m: 210, h_m: 210, area_m2: 44100 });
  });

  it('gives parcel 418 one cell and parcel 1027 its 7 × 7', () => {
    expect(parcelDimensionsFrom(SATS, 418)).toEqual({ index: 418, x_m: 861, y_m: 756, w_m: 42, h_m: 42, area_m2: 1764 });
    expect(parcelDimensionsFrom(SATS, 1027)).toEqual({ index: 1027, x_m: 903, y_m: 1680, w_m: 294, h_m: 294, area_m2: 86436 });
  });

  it('refuses parcels out of range', () => {
    expect(parcelDimensionsFrom(SATS, 1114)).toBeNull();
    expect(parcelDimensionsFrom(SATS, -1)).toBeNull();
    expect(parcelDimensionsFrom(SATS, 1.5)).toBeNull();
  });

  it('prints the block page scale line', () => {
    expect(scaleLine(s)).toBe('2.1 km × 2.1 km · 1,114 parcels · mean lot ≈ 63 m');
  });
});

describe('the async helpers read the block summary', () => {
  const summary = getBlockSummary as jest.Mock;
  beforeEach(() => summary.mockReset());

  it('districtScale(height) and parcelDimensions(height, i) use the cached summary', async () => {
    summary.mockResolvedValue({ height: 612888, vsize: FIXTURE.vsize, value: SATS });
    await expect(districtScale(612888)).resolves.toMatchObject({ parcels: 1114, mean_lot_m2: 3959 });
    await expect(parcelDimensions(612888, 418)).resolves.toMatchObject({ w_m: 42, h_m: 42 });
    await expect(parcelDimensions(612888, 5000)).resolves.toBeNull();
    expect(summary).toHaveBeenCalledWith(612888);
  });

  it('refuses a summary missing one output total rather than guessing a layout', async () => {
    summary.mockResolvedValue({ height: 612888, vsize: FIXTURE.vsize, value: SATS.map((v, i) => (i === 7 ? null : v)) });
    await expect(districtScale(612888)).rejects.toThrow('output total');
  });

  it('a one-transaction block is one parcel filling the square', () => {
    const one = districtScaleFrom(1, [5_000_000_000]);
    expect(one).toMatchObject({ parcels: 1, mean_lot_m2: 4_410_000, grid: { cols: 5, rows: 5 }, parcel_area_m2: 4_410_000, open_area_m2: 0 });
  });
});
