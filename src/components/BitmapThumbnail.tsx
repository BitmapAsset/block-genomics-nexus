"use client";

import { useEffect, useRef, useState } from "react";

// ── Module-level cache ──
const blockCache = new Map<number, BlockData>();
const inflightRequests = new Map<number, Promise<BlockData>>();

interface BlockData {
  txCount: number;
  txSizes: number[] | null; // null = equal-area mode
}

async function fetchBlockData(blockHeight: number): Promise<BlockData> {
  if (blockCache.has(blockHeight)) return blockCache.get(blockHeight)!;
  if (inflightRequests.has(blockHeight)) return inflightRequests.get(blockHeight)!;

  const promise = (async (): Promise<BlockData> => {
    // Get block hash
    const hashRes = await fetch(`https://mempool.space/api/block-height/${blockHeight}`);
    if (!hashRes.ok) throw new Error("hash fetch failed");
    const hash = await hashRes.text();

    // Get block info for tx count
    const infoRes = await fetch(`https://mempool.space/api/block/${hash}`);
    if (!infoRes.ok) throw new Error("block info fetch failed");
    const info = await infoRes.json();
    const txCount: number = info.tx_count || 1;

    let txSizes: number[] | null = null;

    // For smaller blocks, fetch actual tx sizes for realistic Mondrian
    if (txCount <= 500) {
      try {
        const pages = Math.ceil(txCount / 25);
        const allTxs: { weight: number }[] = [];
        for (let i = 0; i < pages; i++) {
          const txRes = await fetch(`https://mempool.space/api/block/${hash}/txs/${i * 25}`);
          if (!txRes.ok) break;
          const txs = await txRes.json();
          allTxs.push(...txs);
        }
        if (allTxs.length > 0) {
          txSizes = allTxs.map((tx) => Math.ceil((tx.weight || 400) / 4)); // vbytes
        }
      } catch {
        // Fall back to equal area
      }
    }

    const data: BlockData = { txCount, txSizes };
    blockCache.set(blockHeight, data);
    inflightRequests.delete(blockHeight);
    return data;
  })();

  inflightRequests.set(blockHeight, promise);
  return promise;
}

// ── Mondrian layout ──
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  isCoinbase: boolean;
}

function computeLayout(
  size: number,
  txCount: number,
  txSizes: number[] | null
): Rect[] {
  if (txCount === 0) return [];

  // Scale gap down for high-tx blocks so parcels don't disappear
  const estRows = Math.max(1, Math.round(Math.sqrt(txCount)));
  const gapRatio = estRows > 30 ? 0.005 : estRows > 20 ? 0.01 : 0.02;
  const gap = Math.max(0, Math.round(size * gapRatio));
  const canvasSize = size;

  // Determine vbytes per tx
  const vbytes: number[] = txSizes
    ? txSizes.slice(0, txCount)
    : Array.from({ length: txCount }, () => 1);

  const totalVbytes = vbytes.reduce((a, b) => a + b, 0);
  if (totalVbytes === 0) return [];

  // Partition txs into rows using a greedy algorithm
  // Target: sqrt(txCount) rows for roughly square parcels
  const targetRows = Math.max(1, Math.round(Math.sqrt(txCount)));
  const targetVbytesPerRow = totalVbytes / targetRows;

  const rows: { txIndices: number[]; totalVbytes: number }[] = [];
  let currentRow: number[] = [];
  let currentRowVbytes = 0;

  for (let i = 0; i < vbytes.length; i++) {
    currentRow.push(i);
    currentRowVbytes += vbytes[i];

    if (
      currentRowVbytes >= targetVbytesPerRow &&
      i < vbytes.length - 1
    ) {
      rows.push({ txIndices: currentRow, totalVbytes: currentRowVbytes });
      currentRow = [];
      currentRowVbytes = 0;
    }
  }
  if (currentRow.length > 0) {
    rows.push({ txIndices: currentRow, totalVbytes: currentRowVbytes });
  }

  // Compute row heights proportional to their total vbytes
  const rowTotalVbytes = rows.reduce((a, r) => a + r.totalVbytes, 0);
  const totalGapY = gap * (rows.length - 1);
  const usableHeight = canvasSize - totalGapY;

  const rects: Rect[] = [];
  let y = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rowHeight = Math.max(
      1,
      ri === rows.length - 1
        ? canvasSize - y
        : Math.round((row.totalVbytes / rowTotalVbytes) * usableHeight)
    );

    const totalGapX = gap * (row.txIndices.length - 1);
    const usableWidth = canvasSize - totalGapX;
    let x = 0;

    for (let ti = 0; ti < row.txIndices.length; ti++) {
      const txIdx = row.txIndices[ti];
      const txW =
        ti === row.txIndices.length - 1
          ? canvasSize - x
          : Math.max(
              1,
              Math.round((vbytes[txIdx] / row.totalVbytes) * usableWidth)
            );

      rects.push({
        x,
        y,
        w: Math.max(1, txW - (ti < row.txIndices.length - 1 ? gap : 0)),
        h: Math.max(1, rowHeight - (ri < rows.length - 1 ? gap : 0)),
        isCoinbase: txIdx === 0,
      });

      x += txW + (ti < row.txIndices.length - 1 ? gap : 0);
    }

    y += rowHeight + (ri < rows.length - 1 ? gap : 0);
  }

  return rects;
}

function drawThumbnail(
  canvas: HTMLCanvasElement,
  size: number,
  data: BlockData
) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const px = size * dpr;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, px, px);

  // Background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, px, px);

  // Compute and draw parcels
  const rects = computeLayout(px, data.txCount, data.txSizes);

  // Generate deterministic colors per-block using block height as seed
  const seed = data.txCount * 7 + (data.txSizes ? data.txSizes.length : 0);
  
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.isCoinbase) {
      ctx.fillStyle = "#f7931a";
    } else {
      ctx.fillStyle = "#ff9500";
    }
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

// ── Component ──
export default function BitmapThumbnail({
  blockHeight,
  size = 64,
  className,
}: {
  blockHeight: number;
  size?: number;
  className?: string;
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
      drawThumbnail(canvasRef.current, size, data);
    }
  }, [state, data, size]);

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
