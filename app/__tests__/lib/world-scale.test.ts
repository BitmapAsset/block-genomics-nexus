/**
 * World scale (lib/world-scale): block 612,888 as a 2.1 km × 2.1 km district,
 * from the recorded mempool summary (the same fixture the layout truth test
 * pins, research/layout-2026-10-20/TRUTH.md).
 */

jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return { ...actual, getBlockSummary: jest.fn() };
});

import fs from 'fs';
import path from 'path';
import { getBlockSummary } from '@/lib/block-summary';
import { packSquares } from '@/lib/square-packing';
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
) as { height: number; vsize: number[] };
const VSIZE = FIXTURE.vsize;

describe('WORLD_SCALE constants', () => {
  it('is a 2,100 m square of 4.41 km²', () => {
    expect(BLOCK_EDGE_M).toBe(2100);
    expect(BLOCK_AREA_M2).toBe(4_410_000);
    expect(BLOCK_EDGE_M * BLOCK_EDGE_M).toBe(BLOCK_AREA_M2);
    expect(WORLD_SCALE.VBYTES_PER_CELL).toBe(256);
    expect(HEIGHT_CAP_M).toBe(300);
  });
});

describe('block 612,888', () => {
  const s = districtScaleFrom(612888, VSIZE);
  const rects = parcelRectsFrom(VSIZE);

  it('has 1,114 parcels and a mean lot of 3,959 m² (≈ 63 m)', () => {
    expect(s.parcels).toBe(1114);
    expect(Math.abs(s.mean_lot_m2 - 3959)).toBeLessThanOrEqual(1);
    expect(s.mean_lot_edge_m).toBeCloseTo(62.9, 1);
    expect(s.edge_m).toBe(2100);
    expect(s.area_m2).toBe(4_410_000);
    expect(s.height_cap_m).toBe(300);
  });

  it('maps the 41 × 43 packer grid onto the square (51.22 m × 48.84 m cells)', () => {
    expect(s.grid).toEqual({ cols: 41, rows: 43, cell_x_m: 51.22, cell_y_m: 48.84 });
    const layout = layoutOf(VSIZE);
    expect(layout).toEqual(packSquares(VSIZE.map((vbytes, index) => ({ index, vbytes }))));
  });

  it('puts every parcel inside the square', () => {
    expect(rects).toHaveLength(1114);
    for (const r of rects) {
      expect(r.x_m).toBeGreaterThanOrEqual(0);
      expect(r.y_m).toBeGreaterThanOrEqual(0);
      expect(r.x_m + r.w_m).toBeLessThanOrEqual(BLOCK_EDGE_M + 1e-6);
      expect(r.y_m + r.h_m).toBeLessThanOrEqual(BLOCK_EDGE_M + 1e-6);
      expect(r.area_m2).toBeCloseTo(r.w_m * r.h_m, 6);
    }
  });

  it('never overlaps two parcels', () => {
    const { squares, gridWidth, gridHeight } = layoutOf(VSIZE);
    const seen = new Uint8Array(gridWidth * gridHeight);
    for (const q of squares) {
      for (let y = q.y; y < q.y + q.size; y++) {
        for (let x = q.x; x < q.x + q.size; x++) {
          expect(seen[y * gridWidth + x]).toBe(0);
          seen[y * gridWidth + x] = 1;
        }
      }
    }
  });

  it('sums to 4.41 km²: parcels plus the open cells, to rounding', () => {
    const parcels = rects.reduce((sum, r) => sum + r.area_m2, 0);
    expect(Math.abs(parcels - s.parcel_area_m2)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.parcel_area_m2 + s.open_area_m2 - BLOCK_AREA_M2)).toBeLessThanOrEqual(1);
    // 1,622 of the 1,763 cells are parcels: 92.0 % of the district.
    expect(s.parcel_area_m2).toBe(4_057_300);
    expect(s.open_area_m2).toBe(352_700);
  });

  it('gives parcel 418 its metres (one cell) and parcel 641 its 7 × 7 cells', () => {
    expect(parcelDimensionsFrom(VSIZE, 418)).toEqual({ index: 418, x_m: 204.88, y_m: 586.05, w_m: 51.22, h_m: 48.84, area_m2: 2501.42 });
    expect(parcelDimensionsFrom(VSIZE, 641)).toEqual({ index: 641, x_m: 1690.24, y_m: 830.23, w_m: 358.54, h_m: 341.86, area_m2: 122569.48 });
    expect(parcelDimensionsFrom(VSIZE, 0)).toMatchObject({ x_m: 0, y_m: 0 });
  });

  it('refuses parcels out of range', () => {
    expect(parcelDimensionsFrom(VSIZE, 1114)).toBeNull();
    expect(parcelDimensionsFrom(VSIZE, -1)).toBeNull();
    expect(parcelDimensionsFrom(VSIZE, 1.5)).toBeNull();
  });

  it('prints the block page scale line', () => {
    expect(scaleLine(s)).toBe('2.1 km × 2.1 km · 1,114 parcels · mean lot ≈ 63 m');
  });
});

describe('the async helpers read the block summary', () => {
  const summary = getBlockSummary as jest.Mock;
  beforeEach(() => summary.mockReset());

  it('districtScale(height) and parcelDimensions(height, i) use the cached summary', async () => {
    summary.mockResolvedValue({ height: 612888, vsize: VSIZE });
    await expect(districtScale(612888)).resolves.toMatchObject({ parcels: 1114, mean_lot_m2: 3959 });
    await expect(parcelDimensions(612888, 418)).resolves.toMatchObject({ w_m: 51.22, h_m: 48.84 });
    await expect(parcelDimensions(612888, 5000)).resolves.toBeNull();
    expect(summary).toHaveBeenCalledWith(612888);
  });

  it('a one-transaction block is one parcel filling the square', () => {
    const one = districtScaleFrom(1, [200]);
    expect(one).toMatchObject({ parcels: 1, mean_lot_m2: 4_410_000, grid: { cols: 1, rows: 1 }, parcel_area_m2: 4_410_000, open_area_m2: 0 });
  });
});
