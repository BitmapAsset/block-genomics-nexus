/**
 * Server-side bitmap thumbnail renderer.
 * Produces squarified treemap PNGs matching Bitfeed / bitmap.land standard.
 *
 * Uses node-canvas for rasterisation and the canonical squarified treemap algorithm.
 */

import { createCanvas } from 'canvas';
import { squarifiedTreemapWithGap, type TreemapInput } from './squarified-treemap';

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

  // White background (Magic Eden standard)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  if (txs.length === 0) return canvas.toBuffer('image/png');

  // Build treemap input
  const items: TreemapInput[] = txs.map((tx, i) => ({
    index: i,
    weight: Math.max(1, tx.vbytes),
  }));

  // Gap: thin lines between parcels (~3% of average cell, min 0.5px)
  const avgCellSize = size / Math.sqrt(txs.length);
  const gap = Math.max(0.5, avgCellSize * 0.03);

  // Compute squarified treemap
  const rects = squarifiedTreemapWithGap(
    items,
    { x: 0, y: 0, width: size, height: size },
    gap
  );

  const baseHue = 28;
  const baseSat = 90;

  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;

    const tx = txs[rect.index];
    // Uniform orange with slight brightness variation
    const lightness = tx?.isCoinbase ? 65 : 45 + (tx.vbytes % 20);
    ctx.fillStyle = `hsl(${baseHue}, ${baseSat}%, ${lightness}%)`;
    ctx.fillRect(rect.x, rect.y, Math.max(0.5, rect.width), Math.max(0.5, rect.height));
  }

  return canvas.toBuffer('image/png');
}
