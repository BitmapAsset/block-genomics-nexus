/**
 * Server-side bitmap thumbnail renderer.
 * Produces Mondrian-layout PNGs matching Bitfeed / Magic Eden / Bitmap.Community standard.
 *
 * Uses node-canvas for rasterisation.
 * Algorithm: faithful port of bitfeed's TxMondrianPoolScene.
 */

import { createCanvas } from "canvas";

export interface TxInput {
  vbytes: number; // virtual bytes (weight / 4)
}

// ── Bitfeed byteTxSize (exact match) ──
function byteTxSize(vbytes: number): number {
  if (!vbytes) vbytes = 1;
  return Math.max(1, Math.ceil(Math.sqrt(vbytes / 256)));
}

// ── Mondrian Layout (faithful port of bitfeed's TxMondrianPoolScene) ──

interface MSlot {
  x: number;
  y: number;
  r: number;
}

interface MRow {
  y: number;
  slots: MSlot[];
  map: Record<number, MSlot>;
}

class MondrianLayout {
  width: number;
  rowOffset: number;
  rows: MRow[];

  constructor(width: number) {
    this.width = width;
    this.rowOffset = 0;
    this.rows = [];
  }

  addRow(): MRow {
    const newRow: MRow = {
      y: this.rows.length + this.rowOffset,
      slots: [],
      map: {},
    };
    this.rows.push(newRow);
    return newRow;
  }

  getRow(y: number): MRow | undefined {
    return this.rows[y - this.rowOffset];
  }

  getSlot(x: number, y: number): MSlot | undefined {
    const row = this.getRow(y);
    return row ? row.map[x] : undefined;
  }

  addSlot(slot: MSlot): MSlot | undefined {
    if (slot.r <= 0) return undefined;
    const existing = this.getSlot(slot.x, slot.y);
    if (existing) {
      if (slot.r > existing.r) existing.r = slot.r;
      return existing;
    }
    const row = this.getRow(slot.y);
    if (!row) return undefined;

    let insertAt: number | null = null;
    for (let i = 0; i < row.slots.length && insertAt == null; i++) {
      if (row.slots[i].x > slot.x) insertAt = i;
    }
    if (insertAt == null) row.slots.push(slot);
    else row.slots.splice(insertAt, 0, slot);
    row.map[slot.x] = slot;
    return slot;
  }

  removeSlot(slot: MSlot): void {
    const row = this.getRow(slot.y);
    if (row) {
      delete row.map[slot.x];
      const idx = row.slots.indexOf(slot);
      if (idx >= 0) row.slots.splice(idx, 1);
    }
  }

  fillSlot(
    slot: MSlot,
    squareWidth: number
  ): { x: number; y: number; r: number } {
    const square = {
      left: slot.x,
      right: slot.x + squareWidth,
      top: slot.y + squareWidth,
    };

    this.removeSlot(slot);

    for (let rowIndex = slot.y; rowIndex < square.top; rowIndex++) {
      const row = this.getRow(rowIndex);
      if (row) {
        const collisions: MSlot[] = [];
        let maxExcess = 0;
        for (const testSlot of row.slots) {
          if (
            !(
              testSlot.x + testSlot.r < square.left ||
              testSlot.x >= square.right
            )
          ) {
            collisions.push(testSlot);
            maxExcess = Math.max(
              maxExcess,
              Math.max(0, testSlot.x + testSlot.r - (slot.x + slot.r))
            );
          }
        }
        if (square.right < this.width && !row.map[square.right]) {
          this.addSlot({
            x: square.right,
            y: rowIndex,
            r: slot.r - squareWidth + maxExcess,
          });
        }
        for (const c of collisions) {
          c.r = slot.x - c.x;
          if (c.r <= 0) this.removeSlot(c);
        }
      } else {
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: rowIndex, r: slot.x });
        if (square.right < this.width)
          this.addSlot({
            x: square.right,
            y: rowIndex,
            r: this.width - square.right,
          });
      }
    }

    for (
      let rowIndex = Math.max(0, slot.y - squareWidth);
      rowIndex < slot.y;
      rowIndex++
    ) {
      const row = this.getRow(rowIndex);
      if (row) {
        for (const testSlot of row.slots) {
          if (
            testSlot.x < slot.x + squareWidth &&
            testSlot.x + testSlot.r > slot.x &&
            testSlot.y + testSlot.r >= slot.y
          ) {
            const oldSlotWidth = testSlot.r;
            testSlot.r = slot.y - testSlot.y;
            if (testSlot.r <= 0) this.removeSlot(testSlot);
            const remaining = {
              x: testSlot.x + testSlot.r,
              y: testSlot.y,
              w: oldSlotWidth - testSlot.r,
              h: testSlot.r,
            };
            while (remaining.w > 0 && remaining.h > 0) {
              if (remaining.w <= remaining.h) {
                this.addSlot({
                  x: remaining.x,
                  y: remaining.y,
                  r: remaining.w,
                });
                remaining.y += remaining.w;
                remaining.h -= remaining.w;
              } else {
                this.addSlot({
                  x: remaining.x,
                  y: remaining.y,
                  r: remaining.h,
                });
                remaining.x += remaining.h;
                remaining.w -= remaining.h;
              }
            }
          }
        }
      }
    }

    return { x: slot.x, y: slot.y, r: squareWidth };
  }

  place(size: number): { x: number; y: number; r: number } {
    let found = false;
    let rowIndex = 0;
    let slotIndex = 0;
    let square: { x: number; y: number; r: number } | null = null;

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

// Bitfeed orange: HCL(65.16°, 78.225, 70.8) → rgb(253,147,30)
const BITFEED_ORANGE = "#fd931e";
const BITFEED_BG = "#1d1f31";

/**
 * Render a standard bitmap thumbnail matching Bitfeed/Magic Eden.
 *
 * @param txs  Array of transactions in natural block order
 * @param size Canvas width & height in pixels (default 256)
 * @returns    PNG buffer
 */
export function renderBitmapThumbnail(txs: TxInput[], size = 256): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BITFEED_BG;
  ctx.fillRect(0, 0, size, size);

  if (txs.length === 0) return canvas.toBuffer("image/png");

  const txSizes = txs.map((tx) => byteTxSize(tx.vbytes));
  const totalArea = txSizes.reduce((s, sz) => s + sz * sz, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;
  const unitPadding = pxPerGrid / 4;

  const layout = new MondrianLayout(gridW);

  for (let i = 0; i < txSizes.length; i++) {
    const pos = layout.place(txSizes[i]);
    const x = pos.x * pxPerGrid + unitPadding;
    const y = pos.y * pxPerGrid + unitPadding;
    const w = pos.r * pxPerGrid - unitPadding * 2;
    const h = pos.r * pxPerGrid - unitPadding * 2;

    if (w > 0 && h > 0) {
      ctx.fillStyle = BITFEED_ORANGE;
      ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));
    }
  }

  return canvas.toBuffer("image/png");
}
