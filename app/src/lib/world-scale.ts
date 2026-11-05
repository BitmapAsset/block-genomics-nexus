/**
 * World scale: one Bitmap block is one 2.1 km × 2.1 km district, and every
 * parcel on it has real dimensions in metres.
 *
 * Every builder (the browser world, an Unreal import, an agent placing a tower
 * through MCP, a human reading a proof) has to mean the same thing by "a 12 m
 * tower on parcel 418", so the numbers live here, once.
 *
 * THE MAPPING. The parcel layout is the canonical Bitmap layout (lib/bitmap-layout):
 * one square per transaction in tx-index order, side = max(1, ⌈log10(output
 * sats)⌉ − 5) cells, packed by Bitfeed's Mondrian packer, the picture bitmap.land
 * and Magic Eden draw. The squares use `width × height` cells (47 × 50 for block
 * 612,888). The larger side spans the 2,100 m square and cells stay square, so a
 * cell is `2100 / max(width, height)` m (42 m on 612,888) and the content is
 * centred on the shorter axis, exactly as the thumbnail draws it. Every parcel
 * lies inside the district, and occupied + unoccupied cells (including the
 * margin) sum to exactly 4.41 km².
 *
 * Coordinates: metres from the district's north-west corner (the thumbnail's
 * top-left), `x_m` along the packer's x (east), `y_m` along the packer's y
 * (south, the thumbnail's downward axis; +z in the 3D viewer).
 *
 * `mean_lot_m2` is the district area shared per transaction (area / parcels),
 * the figure the block page prints. The built footprint (only the occupied
 * cells) is reported separately as `parcel_area_m2`; the difference is the
 * packer's open cells, which is where streets and commons go.
 *
 * The pure half (`*From`) takes the block's per-transaction output totals in
 * sats; `districtScale(height)` and `parcelDimensions(height, index)` fetch them
 * through the cached block summary.
 */

import { packFrame, type PackResult } from '@/lib/square-packing';
import { completeSatTotals, layoutBlock } from '@/lib/bitmap-layout';
import { getBlockSummary } from '@/lib/block-summary';

/** District edge in metres (Gary, 2026-10-27: a real 2.1 km × 2.1 km plot). */
export const BLOCK_EDGE_M = 2100;
/** District area in m² (4.41 km², 441 ha). */
export const BLOCK_AREA_M2 = 4_410_000;

export const WORLD_SCALE = {
  BLOCK_EDGE_M,
  BLOCK_AREA_M2,
  /** The square side rule: max(1, ⌈log10(output sats)⌉ − SATS_LOG10_OFFSET) cells. */
  SATS_LOG10_OFFSET: 5,
} as const;

export interface DistrictGrid {
  /** Columns the squares use. */
  cols: number;
  /** Rows the squares use. */
  rows: number;
  /** Metres per layout unit (one packer cell), east-west. Equal to cell_y_m: cells are square. */
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

/** The canonical packing of a block's output totals (tx-index order). */
export function layoutOf(sats: readonly number[]): PackResult {
  const l = layoutBlock(sats);
  return { squares: l.squares, gridWidth: l.gridLength, gridHeight: l.height, contentWidth: l.width };
}

export function gridOf(layout: PackResult): DistrictGrid {
  const { extent } = packFrame(layout);
  const cell = BLOCK_EDGE_M / extent;
  return { cols: Math.max(layout.contentWidth, 1), rows: Math.max(layout.gridHeight, 1), cell_x_m: cell, cell_y_m: cell };
}

/** Every parcel's rectangle in metres, by tx index. Full precision (no rounding). */
export function parcelRectsFrom(sats: readonly number[]): ParcelRect[] {
  const layout = layoutOf(sats);
  const g = gridOf(layout);
  const { offsetX, offsetY } = packFrame(layout);
  const rects: ParcelRect[] = new Array(layout.squares.length);
  for (const sq of layout.squares) {
    const w = sq.size * g.cell_x_m;
    const h = sq.size * g.cell_y_m;
    rects[sq.index] = {
      index: sq.index,
      x_m: (sq.x + offsetX) * g.cell_x_m,
      y_m: (sq.y + offsetY) * g.cell_y_m,
      w_m: w,
      h_m: h,
      area_m2: w * h,
    };
  }
  return rects;
}

/** One parcel's rectangle, rounded to the centimetre; null when out of range. */
export function parcelDimensionsFrom(sats: readonly number[], index: number): ParcelRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= sats.length) return null;
  const r = parcelRectsFrom(sats)[index];
  return {
    index,
    x_m: round(r.x_m, 2),
    y_m: round(r.y_m, 2),
    w_m: round(r.w_m, 2),
    h_m: round(r.h_m, 2),
    area_m2: round(r.area_m2, 2),
  };
}

export function districtScaleFrom(height: number, sats: readonly number[]): DistrictScale {
  const layout = layoutOf(sats);
  const g = gridOf(layout);
  const { extent } = packFrame(layout);
  const parcels = sats.length;
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
    open_area_m2: Math.round((extent * extent - cells) * cellArea),
    height_cap_m: HEIGHT_CAP_M,
  };
}

/** The one-line scale caption the block page prints under the map. */
export function scaleLine(s: Pick<DistrictScale, 'parcels' | 'mean_lot_edge_m'>): string {
  return `2.1 km × 2.1 km · ${s.parcels.toLocaleString('en-US')} parcels · mean lot ≈ ${Math.round(s.mean_lot_edge_m)} m`;
}

/** A block's output totals from the cached summary; throws when one is missing (no partial layout). */
async function blockSats(height: number): Promise<number[]> {
  const summary = await getBlockSummary(height);
  const sats = completeSatTotals(summary.value);
  if (!sats) throw new Error('Block summary tx without an output total');
  return sats;
}

/** District scale for a mined block (throws BlockNotFoundError / fetch errors from the summary). */
export async function districtScale(height: number): Promise<DistrictScale> {
  return districtScaleFrom(height, await blockSats(height));
}

/** One parcel of a mined block in metres, or null when `index` is out of range. */
export async function parcelDimensions(height: number, index: number): Promise<ParcelRect | null> {
  return parcelDimensionsFrom(await blockSats(height), index);
}
