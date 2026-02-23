"use client";

import { useEffect, useRef, useState } from "react";

// ── Module-level cache ──
const blockCache = new Map<number, BlockData>();
const inflightRequests = new Map<number, Promise<BlockData>>();

const MAX_TXS = 5000;

interface TxInfo {
  vbytes: number;
  isCoinbase: boolean;
}

interface BlockData {
  txCount: number;
  txs: TxInfo[];
}

async function fetchBlockData(blockHeight: number): Promise<BlockData> {
  if (blockCache.has(blockHeight)) return blockCache.get(blockHeight)!;
  if (inflightRequests.has(blockHeight)) return inflightRequests.get(blockHeight)!;

  const promise = (async (): Promise<BlockData> => {
    const hashRes = await fetch(`https://mempool.space/api/block-height/${blockHeight}`);
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
      const txRes = await fetch(`https://mempool.space/api/block/${hash}/txs/${i * 25}`);
      if (!txRes.ok) break;
      const batch: { weight: number }[] = await txRes.json();
      for (let j = 0; j < batch.length && txs.length < fetchCount; j++) {
        txs.push({
          vbytes: Math.ceil((batch[j].weight || 400) / 4),
          isCoinbase: txs.length === 0,
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

// ── Bitfeed-style square packing ──

interface PackedRect {
  x: number;
  y: number;
  size: number;
  isCoinbase: boolean;
}

interface Slot {
  x: number;
  y: number;
  size: number;
}

function packSquares(txs: TxInfo[]): { rects: PackedRect[]; gridSize: number } {
  if (txs.length === 0) return { rects: [], gridSize: 1 };

  // Compute square side per tx
  const squares = txs.map((tx) => ({
    side: Math.max(1, Math.ceil(Math.sqrt(tx.vbytes / 256))),
    isCoinbase: tx.isCoinbase,
  }));

  // Sort by size descending for packing
  const indices = squares.map((_, i) => i);
  indices.sort((a, b) => squares[b].side - squares[a].side);

  const totalArea = squares.reduce((s, sq) => s + sq.side * sq.side, 0);
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(totalArea)));

  // Greedy slot-based packing
  const slots: Slot[] = [{ x: 0, y: 0, size: gridSize }];
  const rects: PackedRect[] = [];

  for (const idx of indices) {
    const side = squares[idx].side;
    
    // Find first slot that fits
    let bestSlotIdx = -1;
    for (let si = 0; si < slots.length; si++) {
      if (slots[si].size >= side) {
        bestSlotIdx = si;
        break;
      }
    }

    if (bestSlotIdx === -1) {
      // Doesn't fit — skip (shouldn't happen with correct grid sizing)
      continue;
    }

    const slot = slots[bestSlotIdx];
    slots.splice(bestSlotIdx, 1);

    rects.push({
      x: slot.x,
      y: slot.y,
      size: side,
      isCoinbase: squares[idx].isCoinbase,
    });

    const remainder = slot.size - side;
    if (remainder > 0) {
      // Right strip
      slots.push({ x: slot.x + side, y: slot.y, size: remainder });
      // Bottom strip (full width of original slot)
      slots.push({ x: slot.x, y: slot.y + side, size: remainder });
    }

    // Sort slots: prefer top-left, then smaller slots first for tighter packing
    slots.sort((a, b) => a.y - b.y || a.x - b.x || a.size - b.size);
  }

  return { rects, gridSize };
}

function drawThumbnail(
  canvas: HTMLCanvasElement,
  size: number,
  data: BlockData,
  variant: "dark" | "light"
) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const px = size * dpr;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = variant === "light" ? "#ffffff" : "#000000";
  ctx.fillRect(0, 0, px, px);

  if (data.txs.length === 0) return;

  const { rects, gridSize } = packSquares(data.txs);
  const cellSize = px / gridSize;
  // Gap = ~1px at device level, scaled
  const gap = Math.max(0.5, cellSize * 0.06);

  for (const r of rects) {
    const x = r.x * cellSize;
    const y = r.y * cellSize;
    const w = r.size * cellSize - gap;
    const h = r.size * cellSize - gap;
    if (w <= 0 || h <= 0) continue;

    ctx.fillStyle = r.isCoinbase ? "#f7931a" : "#ff9500";
    ctx.fillRect(x, y, w, h);
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
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
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
          background: "#ff9500",
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
