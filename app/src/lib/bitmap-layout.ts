/**
 * The canonical Bitmap block layout: one square per transaction, sized by the
 * transaction's output value, packed in block order by Bitfeed's Mondrian packer.
 *
 * This is the picture bitmap.land, Magic Eden, ordpool and ordinals-wallet's
 * renderer all draw for `<height>.bitmap`, and the one every surface here draws
 * from: the server thumbnail, the 2D map tiles, the 3D district and the scale
 * tools. Until 2026-11-05 we sized squares by vbytes (Bitfeed's other mode),
 * which drew a different map: block 612,888's 12.5 BTC coinbase (264 vB) was a
 * 2×2 lot instead of the 5×5 square at the top left of the canonical image.
 *
 *   size  = max(1, ⌈log10(output sats)⌉ − 5)    1 BTC → 3, 50 BTC → 5, < 100k sats → 1
 *   grid  = ⌈√(Σ size²)⌉ wide, squares placed in transaction order
 *   draw  = the larger of content width / height spans the image, half-unit gap
 *
 * Output sats = the sum of every output of the transaction (OP_RETURN zeros
 * included; the coinbase pays subsidy + fees), which is mempool's block-summary
 * `value`. Sources: ordpool-parser src/bitmap (MIT, port of bitlodo/bitmap-utils),
 * ordinals-wallet/bitmap-renderer, bitfeed TxMondrianPoolScene.
 */

import { packSizes, packFrame, type PackedSquare } from '@/lib/square-packing';

/**
 * The server PNG of a block's bitmap (`/api/v1/block-thumbnail`). The query is
 * the art version: browsers and the CDN keep the PNG for a year (immutable), so
 * it changes whenever the picture's rules do (v=3: value-sized squares).
 */
export function bitmapThumbnailUrl(height: number): string {
  return `/api/v1/block-thumbnail/${height}.png?v=3`;
}

/** Square side for a transaction paying `sats` in total outputs. */
export function logTxSize(sats: number): number {
  const clamped = Number.isFinite(sats) ? Math.max(1, sats) : 1;
  return Math.max(1, Math.ceil(Math.log10(clamped)) - 5);
}

/** Square sides for a block's per-transaction output totals, in block order. */
export function txSatsToSizes(satTotals: readonly number[]): number[] {
  return satTotals.map(logTxSize);
}

export interface BlockLayout {
  /** Square side per transaction, block order. */
  sizes: number[];
  /** Placement per transaction, block order (`index` = tx index). */
  squares: PackedSquare[];
  /** The packer's row length, ⌈√(Σ size²)⌉. */
  gridLength: number;
  /** Columns the squares actually use. */
  width: number;
  /** Rows the squares actually use (can exceed gridLength). */
  height: number;
}

/** Lay out a block from its square sides (block order). */
export function layoutFromSizes(sizes: readonly number[]): BlockLayout {
  const packed = packSizes(sizes);
  return {
    sizes: packed.squares.map(q => q.size),
    squares: packed.squares,
    gridLength: packed.gridWidth,
    width: packed.contentWidth,
    height: packed.gridHeight,
  };
}

/** Lay out a block from every transaction's output total in sats (block order). */
export function layoutBlock(satTotals: readonly number[]): BlockLayout {
  return layoutFromSizes(txSatsToSizes(satTotals));
}

/**
 * Output totals for a whole block, or null when any one is missing: a layout
 * with one transaction guessed is a different map, so it is no layout at all.
 */
export function completeSatTotals(values: readonly (number | null | undefined)[]): number[] | null {
  if (values.length === 0) return null;
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    out[i] = v;
  }
  return out;
}

/**
 * A placeholder square side for a transaction whose output total is unknown,
 * drawn from the value distribution of real blocks (mostly 1–3, rarely 5).
 * Only ever used under an "estimated" label; `u` is a uniform [0, 1) draw.
 */
export function estimatedSquareSize(u: number): number {
  if (u < 0.45) return 1;
  if (u < 0.75) return 2;
  if (u < 0.92) return 3;
  if (u < 0.985) return 4;
  return 5;
}

/** Pixel rectangle of each square in a `px` × `px` image, the canonical way (see `drawRects`). */
export interface PixelRect { index: number; x0: number; y0: number; x1: number; y1: number }

/**
 * Where each square lands in a `px` × `px` image, line for line the rule of
 * ordinals-wallet/bitmap-renderer `render_bitmap` (checked there against Magic
 * Eden's images): grid = px / (extent − 0.5), padding = round(grid / 4) taken
 * twice off the far edges (a half-unit gap anchored top-left, bitlodo's
 * `padd = 0.5`), centred horizontally on the content width, top-aligned.
 */
export function drawRects(layout: Pick<BlockLayout, 'squares' | 'width' | 'height'>, px: number): PixelRect[] {
  if (layout.squares.length === 0) return [];
  const { extent } = packFrame({ contentWidth: layout.width, gridHeight: layout.height });
  const grid = px / (extent - 0.5);
  const pad = Math.round(grid / 4);
  const offX = (px - (layout.width * grid - 2 * pad)) / 2;
  const offY = (px - (extent * grid - 2 * pad)) / 2;
  const clamp = (v: number) => Math.min(Math.max(v, 0), px);
  return layout.squares.map(q => ({
    index: q.index,
    x0: clamp(Math.floor(offX + q.x * grid)),
    y0: clamp(Math.floor(offY + q.y * grid)),
    x1: clamp(Math.ceil(offX + (q.x + q.size) * grid - 2 * pad)),
    y1: clamp(Math.ceil(offY + (q.y + q.size) * grid - 2 * pad)),
  }));
}
