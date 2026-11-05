/**
 * Server-side bitmap thumbnail renderer: the canonical Bitmap picture of a block
 * (the one bitmap.land and Magic Eden show), rasterised with node-canvas.
 *
 * Layout and pixel rules live in `@/lib/bitmap-layout` (value-sized squares,
 * Bitfeed Mondrian packer, ordinals-wallet's 576 px drawing rule); this file
 * only paints them.
 */

import { createCanvas } from "canvas";
import { drawRects, layoutFromSizes } from "@/lib/bitmap-layout";

/** Bitcoin orange, the Bitmap community's square colour. */
export const BITMAP_ORANGE = "#F7931A";
const BITMAP_BG = "#1d1f31";

/**
 * Render a block's bitmap from its square sides (block order, from
 * `txSatsToSizes`), as a `size` × `size` PNG.
 */
export function renderBitmapThumbnail(sizes: readonly number[], size = 576): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BITMAP_BG;
  ctx.fillRect(0, 0, size, size);

  if (sizes.length === 0) return canvas.toBuffer("image/png");

  ctx.fillStyle = BITMAP_ORANGE;
  for (const r of drawRects(layoutFromSizes(sizes), size)) {
    const w = Math.max(1, r.x1 - r.x0);
    const h = Math.max(1, r.y1 - r.y0);
    ctx.fillRect(r.x0, r.y0, w, h);
  }

  return canvas.toBuffer("image/png");
}
