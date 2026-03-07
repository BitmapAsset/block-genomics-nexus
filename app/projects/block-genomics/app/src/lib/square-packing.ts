/**
 * Bitfeed Mondrian Layout Algorithm — CANONICAL bitmap standard.
 * Ported from https://github.com/bitfeed-project/bitfeed
 * 
 * This produces THE standard Bitcoin block visualization used by Bitfeed,
 * bitmap platforms, and Block Genomics.
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

/**
 * Convert vbytes to grid square size (matches Bitfeed's byteTxSize exactly).
 */
export function txToSquareSize(vbytes: number, scaleFactor = 256): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, vbytes) / scaleFactor)));
}

interface Slot {
  x: number;
  y: number;
  r: number; // size (width = height = r)
}

interface Row {
  y: number;
  slots: Slot[];
  map: Record<number, Slot>;
}

/**
 * Mondrian Layout — exact port of Bitfeed's TxMondrianPoolScene layout algorithm.
 */
class MondrianLayout {
  width: number;
  rowOffset: number;
  rows: Row[];

  constructor(width: number) {
    this.width = width;
    this.rowOffset = 0;
    this.rows = [];
  }

  addRow(): Row {
    const row: Row = {
      y: this.rows.length + this.rowOffset,
      slots: [],
      map: {},
    };
    this.rows.push(row);
    return row;
  }

  getRow(y: number): Row | undefined {
    return this.rows[y - this.rowOffset];
  }

  getSlot(x: number, y: number): Slot | undefined {
    const row = this.getRow(y);
    return row ? row.map[x] : undefined;
  }

  addSlot(s: Slot): Slot | undefined {
    if (s.r <= 0) return undefined;
    const existing = this.getSlot(s.x, s.y);
    if (existing) {
      if (s.r > existing.r) existing.r = s.r;
      return existing;
    }
    const row = this.getRow(s.y);
    if (!row) return undefined;

    let insertAt: number | null = null;
    for (let i = 0; i < row.slots.length && insertAt === null; i++) {
      if (row.slots[i].x > s.x) insertAt = i;
    }
    if (insertAt === null) row.slots.push(s);
    else row.slots.splice(insertAt, 0, s);
    row.map[s.x] = s;
    return s;
  }

  removeSlot(s: Slot): void {
    const row = this.getRow(s.y);
    if (row) {
      delete row.map[s.x];
      const idx = row.slots.indexOf(s);
      if (idx >= 0) row.slots.splice(idx, 1);
    }
  }

  fillSlot(slot: Slot, squareWidth: number) {
    const square = {
      left: slot.x,
      right: slot.x + squareWidth,
      top: slot.y + squareWidth,
    };

    this.removeSlot(slot);

    // Process rows covered by this square
    for (let ri = slot.y; ri < square.top; ri++) {
      const row = this.getRow(ri);
      if (row) {
        // Find colliding slots
        const collisions: Slot[] = [];
        let maxExtend = 0;
        for (let i = 0; i < row.slots.length; i++) {
          const ts = row.slots[i];
          if (!((ts.x + ts.r < square.left) || (ts.x >= square.right))) {
            collisions.push(ts);
            maxExtend = Math.max(maxExtend, Math.max(0, (ts.x + ts.r) - (slot.x + slot.r)));
          }
        }

        // Add right remainder slot
        if (square.right < this.width && !row.map[square.right]) {
          this.addSlot({ x: square.right, y: ri, r: slot.r - squareWidth + maxExtend });
        }

        // Shrink/remove colliding slots
        for (let i = 0; i < collisions.length; i++) {
          collisions[i].r = slot.x - collisions[i].x;
          if (collisions[i].r > 0) { /* keep */ }
          else this.removeSlot(collisions[i]);
        }
      } else {
        // New row
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: ri, r: slot.x });
        if (square.right < this.width) {
          this.addSlot({ x: square.right, y: ri, r: this.width - square.right });
        }
      }
    }

    // Handle below-square collisions (matching Bitfeed's exact for-loop behavior)
    for (let ri = Math.max(0, slot.y - squareWidth); ri < slot.y; ri++) {
      const row = this.getRow(ri);
      if (row) {
        for (let i = 0; i < row.slots.length; i++) {
          const testSlot = row.slots[i];
          if (
            testSlot.x < slot.x + squareWidth &&
            testSlot.x + testSlot.r > slot.x &&
            testSlot.y + testSlot.r >= slot.y
          ) {
            const oldR = testSlot.r;
            testSlot.r = slot.y - testSlot.y;
            if (testSlot.r > 0) { /* keep */ }
            else this.removeSlot(testSlot);

            // Decompose remainder into sub-squares
            let rem = {
              x: testSlot.x + testSlot.r,
              y: testSlot.y,
              w: oldR - testSlot.r,
              h: testSlot.r,
            };
            while (rem.w > 0 && rem.h > 0) {
              if (rem.w <= rem.h) {
                this.addSlot({ x: rem.x, y: rem.y, r: rem.w });
                rem.y += rem.w;
                rem.h -= rem.w;
              } else {
                this.addSlot({ x: rem.x, y: rem.y, r: rem.h });
                rem.x += rem.h;
                rem.w -= rem.h;
              }
            }
          }
        }
      }
    }

    return { x: slot.x, y: slot.y, r: squareWidth };
  }

  place(size: number) {
    let found = false;
    let rowIndex = 0;
    let slotIndex = 0;
    let square = null;

    while (!found && rowIndex < this.rows.length) {
      const row = this.rows[rowIndex];
      while (!found && slotIndex < row.slots.length) {
        if (row.slots[slotIndex].r >= size) {
          found = true;
          square = this.fillSlot(row.slots[slotIndex], size);
        }
        slotIndex++;
      }
      slotIndex = 0;
      rowIndex++;
    }

    if (!found) {
      const row = this.addRow();
      const slot = this.addSlot({ x: 0, y: row.y, r: this.width })!;
      square = this.fillSlot(slot, size);
    }

    return square!;
  }
}

/**
 * Pack squares using Bitfeed's Mondrian layout algorithm.
 * Processes transactions in NATURAL ORDER (not sorted by size).
 */
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
    result.push({
      index: items[i].index,
      x: pos.x,
      y: pos.y,
      size: pos.r,
    });
    maxY = Math.max(maxY, pos.y + pos.r);
  }

  return { squares: result, gridWidth, gridHeight: maxY };
}

/**
 * Pack squares and convert to world-space coordinates for 3D rendering.
 */
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

  return squares.map(sq => {
    const worldX = sq.x * cellSize - halfBlock;
    const worldZ = sq.y * cellSize - halfBlock;
    const worldSize = sq.size * cellSize;

    return {
      index: sq.index,
      x: worldX + worldSize / 2,
      z: worldZ + worldSize / 2,
      width: Math.max(0.001, worldSize - gap),
      depth: Math.max(0.001, worldSize - gap),
    };
  });
}
