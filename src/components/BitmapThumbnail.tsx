"use client";

import { useEffect, useRef, useState } from "react";
import { packSquares, txToSquareSize, type SquarePackInput } from "@/lib/square-packing";

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

// ── Squarified Treemap rendering (matches Bitfeed / bitmap standard) ──

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

  // Build square-packing input from transaction vbytes
  const items: SquarePackInput[] = data.txs.map((tx, i) => ({
    index: i,
    vbytes: Math.max(1, tx.vbytes),
  }));

  // Pack squares using Bitfeed-style algorithm
  const { squares, gridWidth, gridHeight } = packSquares(items);
  const maxDim = Math.max(gridWidth, gridHeight, 1);
  const cellSize = px / maxDim;
  const gap = Math.max(0.5, cellSize * 0.06);

  // Build index→coinbase lookup
  const coinbaseSet = new Set<number>();
  data.txs.forEach((tx, i) => { if (tx.isCoinbase) coinbaseSet.add(i); });

  for (const sq of squares) {
    const x = sq.x * cellSize;
    const y = sq.y * cellSize;
    const w = sq.size * cellSize - gap;
    const h = sq.size * cellSize - gap;
    if (w <= 0 || h <= 0) continue;
    ctx.fillStyle = coinbaseSet.has(sq.index) ? "#f7931a" : "#ff9500";
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
