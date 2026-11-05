/**
 * Bitfeed Mondrian Layout Algorithm — CANONICAL bitmap standard.
 * Ported from https://github.com/bitfeed-project/bitfeed
 *
 * The packer only places squares; it does not decide how big a transaction's
 * square is. The Bitmap standard sizes a square by the transaction's output
 * value (`logTxSize` in `@/lib/bitmap-layout`), and every caller hands this
 * module those sizes. It is held slot-for-slot equal to ordpool-parser's port
 * of bitlodo's MondrianLayout (lib/vendor/ordpool) by
 * __tests__/lib/bitmap-layout-conformance.test.ts.
 */

export interface SquarePackInput {
  index: number;
  /** Square side in grid units (the Bitmap standard: 1..n from output value). */
  size: number;
}

export interface PackedSquare {
  index: number;
  x: number;
  y: number;
  size: number;
}

export interface PackResult {
  squares: PackedSquare[];
  /** The packer's row length: ceil(sqrt(Σ size²)). */
  gridWidth: number;
  /** Rows actually used: max(y + size). Can exceed gridWidth. */
  gridHeight: number;
  /** Columns actually used: max(x + size). At most gridWidth. */
  contentWidth: number;
}

/**
 * The pre-2026-11-05 square size: sqrt of the transaction's vbytes / 256.
 * This is Bitfeed's "vbytes" mode, NOT the Bitmap standard, and no production
 * code calls it; it stays so tests can show what the old maps were drawn from.
 */
export function legacyVbytesSquareSize(vbytes: number, scaleFactor = 256): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, vbytes) / scaleFactor)));
}

interface Slot { x: number; y: number; r: number; }
interface Row { y: number; slots: Slot[]; map: Record<number, Slot>; }

class MondrianLayout {
  width: number;
  rowOffset = 0;
  rows: Row[] = [];

  constructor(width: number) { this.width = width; }

  addRow(): Row {
    const r: Row = { y: this.rows.length + this.rowOffset, slots: [], map: {} };
    this.rows.push(r);
    return r;
  }

  getRow(y: number): Row | undefined { return this.rows[y - this.rowOffset]; }
  getSlot(x: number, y: number): Slot | undefined { const r = this.getRow(y); return r ? r.map[x] : undefined; }

  addSlot(s: Slot): Slot | undefined {
    if (s.r <= 0) return undefined;
    const e = this.getSlot(s.x, s.y);
    if (e) { if (s.r > e.r) e.r = s.r; return e; }
    const row = this.getRow(s.y);
    if (!row) return undefined;
    let at: number | null = null;
    for (let i = 0; i < row.slots.length && at === null; i++) if (row.slots[i].x > s.x) at = i;
    if (at === null) row.slots.push(s); else row.slots.splice(at, 0, s);
    row.map[s.x] = s;
    return s;
  }

  removeSlot(s: Slot): void {
    const row = this.getRow(s.y);
    if (row) { delete row.map[s.x]; const i = row.slots.indexOf(s); if (i >= 0) row.slots.splice(i, 1); }
  }

  fillSlot(slot: Slot, sw: number) {
    const sq = { left: slot.x, right: slot.x + sw, top: slot.y + sw };
    this.removeSlot(slot);
    for (let ri = slot.y; ri < sq.top; ri++) {
      const row = this.getRow(ri);
      if (row) {
        const cols: Slot[] = [];
        let maxE = 0;
        for (let i = 0; i < row.slots.length; i++) {
          const ts = row.slots[i];
          if (!((ts.x + ts.r < sq.left) || (ts.x >= sq.right))) {
            cols.push(ts);
            maxE = Math.max(maxE, Math.max(0, (ts.x + ts.r) - (slot.x + slot.r)));
          }
        }
        if (sq.right < this.width && !row.map[sq.right]) {
          this.addSlot({ x: sq.right, y: ri, r: slot.r - sw + maxE });
        }
        for (const c of cols) { c.r = slot.x - c.x; if (c.r <= 0) this.removeSlot(c); }
      } else {
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: ri, r: slot.x });
        if (sq.right < this.width) this.addSlot({ x: sq.right, y: ri, r: this.width - sq.right });
      }
    }
    for (let ri = Math.max(0, slot.y - sw); ri < slot.y; ri++) {
      const row = this.getRow(ri);
      if (row) {
        for (let i = 0; i < row.slots.length; i++) {
          const ts = row.slots[i];
          if (ts.x < slot.x + sw && ts.x + ts.r > slot.x && ts.y + ts.r >= slot.y) {
            const old = ts.r;
            ts.r = slot.y - ts.y;
            if (ts.r <= 0) this.removeSlot(ts);
            const rem = { x: ts.x + ts.r, y: ts.y, w: old - ts.r, h: ts.r };
            while (rem.w > 0 && rem.h > 0) {
              if (rem.w <= rem.h) { this.addSlot({ x: rem.x, y: rem.y, r: rem.w }); rem.y += rem.w; rem.h -= rem.w; }
              else { this.addSlot({ x: rem.x, y: rem.y, r: rem.h }); rem.x += rem.h; rem.w -= rem.h; }
            }
          }
        }
      }
    }
    return { x: slot.x, y: slot.y, r: sw };
  }

  place(size: number) {
    let found = false, ri = 0, si = 0, sq = null;
    while (!found && ri < this.rows.length) {
      const row = this.rows[ri];
      while (!found && si < row.slots.length) {
        if (row.slots[si].r >= size) { found = true; sq = this.fillSlot(row.slots[si], size); }
        si++;
      }
      si = 0;
      ri++;
    }
    if (!found) {
      const row = this.addRow();
      const slot = this.addSlot({ x: 0, y: row.y, r: this.width })!;
      sq = this.fillSlot(slot, size);
    }
    return sq!;
  }
}

/** A square side the packer accepts: a whole number ≥ 1. */
function cleanSize(size: number): number {
  return Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1;
}

/** Pack squares of the given sides into a Mondrian grid (Bitfeed algorithm), in input order. */
export function packSquares(items: readonly SquarePackInput[]): PackResult {
  if (items.length === 0) return { squares: [], gridWidth: 0, gridHeight: 0, contentWidth: 0 };

  const txSizes = items.map(item => cleanSize(item.size));
  const totalArea = txSizes.reduce((s, sz) => s + sz * sz, 0);
  const gridWidth = Math.ceil(Math.sqrt(totalArea));

  const layout = new MondrianLayout(gridWidth);
  const result: PackedSquare[] = [];
  let maxX = 0;
  let maxY = 0;

  for (let i = 0; i < items.length; i++) {
    const pos = layout.place(txSizes[i]);
    result.push({ index: items[i].index, x: pos.x, y: pos.y, size: pos.r });
    maxX = Math.max(maxX, pos.x + pos.r);
    maxY = Math.max(maxY, pos.y + pos.r);
  }

  return { squares: result, gridWidth, gridHeight: maxY, contentWidth: maxX };
}

/** Pack a plain list of square sides; square i is transaction i. */
export function packSizes(sizes: readonly number[]): PackResult {
  return packSquares(sizes.map((size, index) => ({ index, size })));
}

/**
 * The drawing frame of a packing, the way the canonical renderers fit it
 * (ordinals-wallet/bitmap-renderer, Magic Eden): the larger of the content's
 * width and height spans the square, cells stay square, and the content is
 * centred on the other axis.
 */
export function packFrame(result: Pick<PackResult, 'gridHeight' | 'contentWidth'>): { extent: number; offsetX: number; offsetY: number } {
  const extent = Math.max(result.contentWidth, result.gridHeight, 1);
  return { extent, offsetX: (extent - result.contentWidth) / 2, offsetY: (extent - result.gridHeight) / 2 };
}

/**
 * Pack squares and convert to 3D world-space coordinates centred on the origin.
 * `blockSize` is the district edge; the packing is fitted by `packFrame`, so a
 * square of side s is s × blockSize / extent on a side and every parcel lies
 * inside the district.
 */
export function packSquaresToWorldSpace(
  items: readonly SquarePackInput[],
  blockSize: number,
  gap: number,
): { index: number; x: number; z: number; width: number; depth: number }[] {
  const packed = packSquares(items);
  const { extent, offsetX, offsetY } = packFrame(packed);
  const cellSize = blockSize / extent;
  const halfBlock = blockSize / 2;

  return packed.squares.map(sq => ({
    index: sq.index,
    x: (sq.x + offsetX) * cellSize - halfBlock + sq.size * cellSize / 2,
    z: (sq.y + offsetY) * cellSize - halfBlock + sq.size * cellSize / 2,
    width: Math.max(0.001, sq.size * cellSize - gap),
    depth: Math.max(0.001, sq.size * cellSize - gap),
  }));
}
