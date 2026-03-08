/**
 * Bitfeed Mondrian Layout Algorithm — CANONICAL bitmap standard.
 * Ported from https://github.com/bitfeed-project/bitfeed
 */

export interface SquarePackInput {
  index: number;
  vbytes: number;
}

export interface PackedSquare {
  index: number;
  x: number;
  y: number;
  size: number;
}

export interface PackResult {
  squares: PackedSquare[];
  gridWidth: number;
  gridHeight: number;
}

export function txToSquareSize(vbytes: number, scaleFactor = 256): number {
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
            let rem = { x: ts.x + ts.r, y: ts.y, w: old - ts.r, h: ts.r };
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

export function packSquares(items: SquarePackInput[], scaleFactor = 256): PackResult {
  if (items.length === 0) return { squares: [], gridWidth: 0, gridHeight: 0 };

  const txSizes = items.map(item => txToSquareSize(item.vbytes, scaleFactor));
  const totalArea = txSizes.reduce((s, sz) => s + sz * sz, 0);
  const gridWidth = Math.ceil(Math.sqrt(totalArea));

  const layout = new MondrianLayout(gridWidth);
  const result: PackedSquare[] = [];
  let maxY = 0;

  for (let i = 0; i < items.length; i++) {
    const pos = layout.place(txSizes[i]);
    result.push({ index: items[i].index, x: pos.x, y: pos.y, size: pos.r });
    maxY = Math.max(maxY, pos.y + pos.r);
  }

  return { squares: result, gridWidth, gridHeight: maxY };
}

export function packSquaresToWorldSpace(
  items: SquarePackInput[],
  blockSize: number,
  gap: number,
  scaleFactor = 256
): { index: number; x: number; z: number; width: number; depth: number }[] {
  const { squares, gridWidth } = packSquares(items, scaleFactor);
  const dim = Math.max(gridWidth, 1);
  const cellSize = blockSize / dim;
  const halfBlock = blockSize / 2;

  return squares.map(sq => ({
    index: sq.index,
    x: sq.x * cellSize - halfBlock + sq.size * cellSize / 2,
    z: sq.y * cellSize - halfBlock + sq.size * cellSize / 2,
    width: Math.max(0.001, sq.size * cellSize - gap),
    depth: Math.max(0.001, sq.size * cellSize - gap),
  }));
}
