/**
 * Server-side bitmap thumbnail renderer.
 * Produces Mondrian-layout PNGs identical to Magic Eden / Bitmap.Community / Bitfeed.
 *
 * Uses node-canvas for rasterisation.
 */

import { createCanvas } from 'canvas';

export interface TxInput {
  vbytes: number; // virtual bytes (weight / 4)
  isCoinbase?: boolean;
}

/**
 * Render a standard bitmap thumbnail.
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

  // --- Bitfeed grid-square algorithm (matches StandardBitmapCanvas) ---
  const squares = txs.map((tx, i) => ({
    index: i,
    gridSize: Math.max(1, Math.ceil(Math.sqrt(tx.vbytes / 256))),
    vbytes: tx.vbytes,
    isCoinbase: !!tx.isCoinbase,
  }));

  const totalArea = squares.reduce((s, sq) => s + sq.gridSize * sq.gridSize, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;

  // Thin gaps (~3 % of grid cell, min 0.5 px)
  const padding = Math.max(pxPerGrid * 0.03, 0.5);

  // Occupancy grid
  const gridH = gridW + 50;
  const occupied: boolean[][] = [];
  for (let r = 0; r < gridH; r++) occupied.push(new Array(gridW).fill(false));

  const baseHue = 28;
  const baseSat = 90;

  for (const sq of squares) {
    const s = sq.gridSize;
    let placed = false;

    for (let row = 0; row < gridH - s + 1 && !placed; row++) {
      for (let col = 0; col <= gridW - s && !placed; col++) {
        let fits = true;
        for (let dr = 0; dr < s && fits; dr++) {
          for (let dc = 0; dc < s && fits; dc++) {
            if (occupied[row + dr]?.[col + dc]) fits = false;
          }
        }
        if (fits) {
          // Mark occupied
          for (let dr = 0; dr < s; dr++) {
            for (let dc = 0; dc < s; dc++) {
              if (occupied[row + dr]) occupied[row + dr][col + dc] = true;
            }
          }

          // Draw parcel
          const x = col * pxPerGrid + padding;
          const y = row * pxPerGrid + padding;
          const w = s * pxPerGrid - padding * 2;
          const h = s * pxPerGrid - padding * 2;

          // Uniform orange with slight brightness variation
          const lightness = sq.isCoinbase ? 65 : 45 + (sq.vbytes % 20);
          ctx.fillStyle = `hsl(${baseHue}, ${baseSat}%, ${lightness}%)`;
          ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));

          placed = true;
        }
      }
    }
  }

  return canvas.toBuffer('image/png');
}
