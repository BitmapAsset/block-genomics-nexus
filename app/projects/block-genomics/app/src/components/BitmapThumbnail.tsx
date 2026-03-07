"use client";

import { useEffect, useRef, useState } from "react";

// ── Module-level cache ──
const blockCache = new Map<number, BlockData>();
const inflightRequests = new Map<number, Promise<BlockData>>();

const MAX_TXS = 5000;

interface TxInfo {
  vbytes: number;
}

interface BlockData {
  txCount: number;
  txs: TxInfo[];
}

async function fetchBlockData(blockHeight: number): Promise<BlockData> {
  if (blockCache.has(blockHeight)) return blockCache.get(blockHeight)!;
  if (inflightRequests.has(blockHeight)) return inflightRequests.get(blockHeight)!;

  const promise = (async (): Promise<BlockData> => {
    const hashRes = await fetch(
      `https://mempool.space/api/block-height/${blockHeight}`
    );
    if (!hashRes.ok) throw new Error("hash fetch failed");
    const hash = await hashRes.text();

    const infoRes = await fetch(`https://mempool.space/api/block/${hash}`);
    if (!infoRes.ok) throw new Error("block info fetch failed");
    const info = await infoRes.json();
    const txCount: number = info.tx_count || 1;

    const fetchCount = Math.min(txCount, MAX_TXS);
    const pages = Math.ceil(fetchCount / 25);
    const txs: TxInfo[] = [];

    for (let i = 0; i < pages; i++) {
      const txRes = await fetch(
        `https://mempool.space/api/block/${hash}/txs/${i * 25}`
      );
      if (!txRes.ok) break;
      const batch: { weight: number }[] = await txRes.json();
      for (let j = 0; j < batch.length && txs.length < fetchCount; j++) {
        txs.push({
          vbytes: Math.ceil((batch[j].weight || 400) / 4),
        });
      }
    }

    const data: BlockData = { txCount, txs };
    blockCache.set(blockHeight, data);
    inflightRequests.delete(blockHeight);
    return data;
  })();

  inflightRequests.set(blockHeight, promise);
  return promise;
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
  r: number; // max square size that fits
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
      bottom: slot.y,
      top: slot.y + squareWidth,
    };

    this.removeSlot(slot);

    // Handle rows within the filled square
    for (let rowIndex = slot.y; rowIndex < square.top; rowIndex++) {
      const row = this.getRow(rowIndex);
      if (row) {
        const collisions: MSlot[] = [];
        let maxExcess = 0;
        for (let i = 0; i < row.slots.length; i++) {
          const testSlot = row.slots[i];
          if (
            !(
              testSlot.x + testSlot.r < square.left ||
              testSlot.x >= square.right
            )
          ) {
            collisions.push(testSlot);
            const excess = Math.max(
              0,
              testSlot.x + testSlot.r - (slot.x + slot.r)
            );
            maxExcess = Math.max(maxExcess, excess);
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
        if (slot.x > 0)
          this.addSlot({ x: 0, y: rowIndex, r: slot.x });
        if (square.right < this.width)
          this.addSlot({
            x: square.right,
            y: rowIndex,
            r: this.width - square.right,
          });
      }
    }

    // Handle rows below the filled square (collision cleanup)
    for (
      let rowIndex = Math.max(0, slot.y - squareWidth);
      rowIndex < slot.y;
      rowIndex++
    ) {
      const row = this.getRow(rowIndex);
      if (row) {
        for (let i = 0; i < row.slots.length; i++) {
          const testSlot = row.slots[i];
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
        const testSlot = row.slots[slotIndex];
        if (testSlot.r >= size) {
          found = true;
          square = this.fillSlot(testSlot, size);
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

// ── Bitfeed-accurate orange via HCL ──
// Bitfeed: orange = { h: 0.181, l: 0.472 } → HCL(65.16°, 78.225, 70.8) → rgb(253,147,30)
const BITFEED_ORANGE = "#fd931e";

function drawThumbnail(
  canvas: HTMLCanvasElement,
  size: number,
  data: BlockData,
  variant: "dark" | "light"
) {
  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const px = size * dpr;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background — bitfeed uses #1d1f31 (dark navy), fallback to white for light variant
  ctx.fillStyle = variant === "light" ? "#ffffff" : "#1d1f31";
  ctx.fillRect(0, 0, px, px);

  if (data.txs.length === 0) return;

  // Compute grid sizes for each tx (natural order — no sorting!)
  const txSizes = data.txs.map((tx) => byteTxSize(tx.vbytes));

  const totalArea = txSizes.reduce((s, sz) => s + sz * sz, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = px / gridW;
  // Bitfeed padding: gridSize / 4 per side (25% each side)
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
      ctx.fillRect(x, y, w, h);
    }
  }
}

// ── Component ──
export default function BitmapThumbnail({
  blockHeight,
  size = 64,
  className,
  variant = "dark",
}: {
  blockHeight: number;
  size?: number;
  className?: string;
  variant?: "dark" | "light";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [data, setData] = useState<BlockData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchBlockData(blockHeight)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [blockHeight]);

  useEffect(() => {
    if (state === "ready" && data && canvasRef.current) {
      drawThumbnail(canvasRef.current, size, data, variant);
    }
  }, [state, data, size, variant]);

  if (state === "loading") {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: "#1a1a2e",
          animation: "bitmap-pulse 1.5s ease-in-out infinite",
          flexShrink: 0,
        }}
      >
        <style>{`@keyframes bitmap-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: BITFEED_ORANGE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.max(8, size * 0.18),
          color: "#fff",
          fontWeight: 700,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {blockHeight}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        flexShrink: 0,
      }}
    />
  );
}
