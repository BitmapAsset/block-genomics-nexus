/**
 * World scale: one Bitmap block is one 2.1 km × 2.1 km district, and every
 * parcel on it has real dimensions in metres.
 *
 * Every builder (the browser world, an Unreal import, an agent placing a tower
 * through MCP, a human reading a proof) has to mean the same thing by "a 12 m
 * tower on parcel 418", so the numbers live here, once.
 *
 * THE MAPPING. The parcel layout is the canonical bitmap layout: one square per
 * transaction in tx-index order, side = ceil(sqrt(vsize / 256)) cells, packed by
 * `packSquares` (the bitfeed port the thumbnail and `ParcelView.mondrianLayout`
 * use). The packer's canvas is `gridWidth × gridHeight` cells (41 × 43 for block
 * 612,888). That canvas is stretched onto the 2,100 m square, so a cell is
 * `2100 / gridWidth` m east-west and `2100 / gridHeight` m north-south
 * (51.2 m × 48.8 m on 612,888). Every parcel therefore lies inside the district,
 * and occupied + unoccupied cells sum to exactly 4.41 km².
 *
 * Coordinates: metres from the district corner where tx 0 sits (the thumbnail's
 * top-left), `x_m` along the packer's x (east), `y_m` along the packer's y
 * (south, the thumbnail's downward axis; +z in the 3D viewer).
 *
 * `mean_lot_m2` is the district area shared per transaction (area / parcels),
 * the figure the block page prints. The built footprint (only the occupied
 * cells) is reported separately as `parcel_area_m2`; the difference is the
 * packer's open cells, which is where streets and commons go.
 *
 * The pure half (`*From`) takes the block's vsizes; `districtScale(height)` and
 * `parcelDimensions(height, index)` fetch them through the cached block summary.
 */

import { packSquares, type PackResult } from '@/lib/square-packing';
import { getBlockSummary } from '@/lib/block-summary';

/** District edge in metres (Gary, 2026-10-27: a real 2.1 km × 2.1 km plot). */
export const BLOCK_EDGE_M = 2100;
/** District area in m² (4.41 km², 441 ha). */
export const BLOCK_AREA_M2 = 4_410_000;

export const WORLD_SCALE = {
  BLOCK_EDGE_M,
  BLOCK_AREA_M2,
  /** The packer's square side: ceil(sqrt(vsize / VBYTES_PER_CELL)) cells. */
  VBYTES_PER_CELL: 256,
} as const;

export interface DistrictGrid {
  cols: number;
  rows: number;
  /** Metres per layout unit (one packer cell), east-west. */
  cell_x_m: number;
  /** Metres per layout unit (one packer cell), north-south. */
  cell_y_m: number;
}

export interface ParcelRect {
  /** Transaction index in the block (the parcel number). */
  index: number;
  x_m: number;
  y_m: number;
  w_m: number;
  h_m: number;
  area_m2: number;
}

export interface DistrictScale {
  height: number;
  edge_m: number;
  area_m2: number;
  parcels: number;
  /** District area per parcel, m² (rounded). */
  mean_lot_m2: number;
  /** Side of a square with that area, m (one decimal). */
  mean_lot_edge_m: number;
  grid: DistrictGrid;
  /** Sum of the parcels' own rectangles, m² (rounded). */
  parcel_area_m2: number;
  /** The packer's unoccupied cells, m² (rounded). parcel + open = area. */
  open_area_m2: number;
  /** Height rule for anything built here, m. */
  height_cap_m: number;
}

/** Flat height cap for v1 (the Living Block spec defines no metre cap tied to BTC). */
export const HEIGHT_CAP_M = 300;

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** The canonical packing of a block's vsizes (tx-index order). */
export function layoutOf(vsize: readonly number[]): PackResult {
  return packSquares(vsize.map((vbytes, index) => ({ index, vbytes })), WORLD_SCALE.VBYTES_PER_CELL);
}

export function gridOf(layout: PackResult): DistrictGrid {
  const cols = Math.max(layout.gridWidth, 1);
  const rows = Math.max(layout.gridHeight, 1);
  return { cols, rows, cell_x_m: BLOCK_EDGE_M / cols, cell_y_m: BLOCK_EDGE_M / rows };
}

/** Every parcel's rectangle in metres, by tx index. Full precision (no rounding). */
export function parcelRectsFrom(vsize: readonly number[]): ParcelRect[] {
  const layout = layoutOf(vsize);
  const g = gridOf(layout);
  const rects: ParcelRect[] = new Array(layout.squares.length);
  for (const sq of layout.squares) {
    const w = sq.size * g.cell_x_m;
    const h = sq.size * g.cell_y_m;
    rects[sq.index] = { index: sq.index, x_m: sq.x * g.cell_x_m, y_m: sq.y * g.cell_y_m, w_m: w, h_m: h, area_m2: w * h };
  }
  return rects;
}

/** One parcel's rectangle, rounded to the centimetre; null when out of range. */
export function parcelDimensionsFrom(vsize: readonly number[], index: number): ParcelRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= vsize.length) return null;
  const r = parcelRectsFrom(vsize)[index];
  return {
    index,
    x_m: round(r.x_m, 2),
    y_m: round(r.y_m, 2),
    w_m: round(r.w_m, 2),
    h_m: round(r.h_m, 2),
    area_m2: round(r.area_m2, 2),
  };
}

export function districtScaleFrom(height: number, vsize: readonly number[]): DistrictScale {
  const layout = layoutOf(vsize);
  const g = gridOf(layout);
  const parcels = vsize.length;
  const cells = layout.squares.reduce((s, q) => s + q.size * q.size, 0);
  const cellArea = g.cell_x_m * g.cell_y_m;
  const mean = parcels > 0 ? BLOCK_AREA_M2 / parcels : BLOCK_AREA_M2;
  return {
    height,
    edge_m: BLOCK_EDGE_M,
    area_m2: BLOCK_AREA_M2,
    parcels,
    mean_lot_m2: Math.round(mean),
    mean_lot_edge_m: round(Math.sqrt(mean), 1),
    grid: { cols: g.cols, rows: g.rows, cell_x_m: round(g.cell_x_m, 2), cell_y_m: round(g.cell_y_m, 2) },
    parcel_area_m2: Math.round(cells * cellArea),
    open_area_m2: Math.round((g.cols * g.rows - cells) * cellArea),
    height_cap_m: HEIGHT_CAP_M,
  };
}

/** The one-line scale caption the block page prints under the map. */
export function scaleLine(s: Pick<DistrictScale, 'parcels' | 'mean_lot_edge_m'>): string {
  return `2.1 km × 2.1 km · ${s.parcels.toLocaleString('en-US')} parcels · mean lot ≈ ${Math.round(s.mean_lot_edge_m)} m`;
}

/** District scale for a mined block (throws BlockNotFoundError / fetch errors from the summary). */
export async function districtScale(height: number): Promise<DistrictScale> {
  const summary = await getBlockSummary(height);
  return districtScaleFrom(height, summary.vsize);
}

/** One parcel of a mined block in metres, or null when `index` is out of range. */
export async function parcelDimensions(height: number, index: number): Promise<ParcelRect | null> {
  const summary = await getBlockSummary(height);
  return parcelDimensionsFrom(summary.vsize, index);
}
