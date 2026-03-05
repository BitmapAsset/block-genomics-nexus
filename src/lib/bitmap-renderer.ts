/**
 * Server-side bitmap thumbnail renderer.
 * Produces squarified treemap PNGs matching Bitfeed / bitmap.land standard.
 *
 * Uses node-canvas for rasterisation and the canonical squarified treemap algorithm.
 */

import { createCanvas } from 'canvas';
import { packSquares, type SquarePackInput } from './square-packing';

export interface TxInput {
  vbytes: number; // virtual bytes (weight / 4)
  isCoinbase?: boolean;
}

/**
 * Render a standard bitmap thumbnail using squarified treemap layout.
 *
 * @param txs  Array of transactions in natural block order
 * @param size Canvas width & height in pixels (default 256)
 * @returns    PNG buffer
 */
export function renderBitmapThumbnail(txs: TxInput[], size = 256): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // White background (Bitfeed standard)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  if (txs.length === 0) return canvas.toBuffer('image/png');

  // Build square-packing input
  const items: SquarePackInput[] = txs.map((tx, i) => ({
    index: i,
    vbytes: Math.max(1, tx.vbytes),
  }));

  // Pack squares (Bitfeed-style)
  const { squares, gridWidth, gridHeight } = packSquares(items);
  const maxDim = Math.max(gridWidth, gridHeight, 1);
  const cellSize = size / maxDim;
  const gap = Math.max(0.5, cellSize * 0.04);

  for (const sq of squares) {
    const x = sq.x * cellSize;
    const y = sq.y * cellSize;
    const w = sq.size * cellSize - gap;
    const h = sq.size * cellSize - gap;
    if (w <= 0 || h <= 0) continue;

    const tx = txs[sq.index];
    const lightness = tx?.isCoinbase ? 65 : 45 + (tx.vbytes % 20);
    ctx.fillStyle = `hsl(28, 90%, ${lightness}%)`;
    ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));
  }

  return canvas.toBuffer('image/png');
}
