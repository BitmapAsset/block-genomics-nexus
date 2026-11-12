'use client';

import { useEffect, useRef } from 'react';
import { packSquares, packFrame } from '@/lib/square-packing';
import { secondaryButton } from '@/components/ui/button';

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan';

interface Props {
  blockHeight: number;
  dataSource: 'loading' | 'real' | 'mock';
  estimated: boolean;
  squares: { txIndex: number; gridSize: number }[];
  txCount: number | null;
  onRetry: () => void;
}

// The flat map: the block from above, drawn from the chain's data only
export default function FlatMap({ blockHeight, dataSource, estimated, squares, txCount, onRetry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);

  // On mount the section takes focus (it opens on a tap); later only when focus fell to <body>, as when "Try again"
  // leaves because the data arrived. Focus on another control stays there.
  useEffect(() => {
    if (!mounted.current || document.activeElement === document.body) sectionRef.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [dataSource]);

  // Render bitmap on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || squares.length === 0) return;

    const SIZE = 576; // Match standard bitmap image size
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Bitfeed dark background
    ctx.fillStyle = '#1d1f31';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ═══ Canonical Bitmap layout (value-sized squares, Mondrian packing) ═══
    // The parcels' own square sizes through the SHARED packer and framing
    // (@/lib/square-packing packFrame) — identical arrangement to the top-view
    // map tile, the server thumbnail and the inside-3D parcels.
    const result = packSquares(squares.map(p => ({ index: p.txIndex, size: p.gridSize })));
    const packed = result.squares.map(sq => ({ x: sq.x, y: sq.y, size: sq.size }));
    if (packed.length === 0) return;

    // Scale to fit canvas — the larger dimension spans it, cells stay square
    const { extent: maxDim, offsetX: offX, offsetY: offY } = packFrame(result);
    const pxPerGrid = SIZE / maxDim;

    // Half-unit gap between squares (bitlodo padd = 0.5, a quarter cell each side)
    const unitPadding = Math.max(0.5, pxPerGrid / 4);

    // Center the block
    const offsetX = offX * pxPerGrid;
    const offsetY = offY * pxPerGrid;

    // Draw grid dots (Bitfeed characteristic background)
    ctx.fillStyle = '#2a2c44';
    for (let gx = 0; gx <= maxDim; gx++) {
      for (let gy = 0; gy <= maxDim; gy++) {
        const dotSize = Math.max(0.5, pxPerGrid * 0.06);
        ctx.fillRect(offsetX + gx * pxPerGrid - dotSize / 2, offsetY + gy * pxPerGrid - dotSize / 2, dotSize, dotSize);
      }
    }

    // Bitcoin orange #F7931A
    for (let i = 0; i < packed.length; i++) {
      const sq = packed[i];
      const x = offsetX + sq.x * pxPerGrid + unitPadding;
      const y = offsetY + sq.y * pxPerGrid + unitPadding;
      const w = sq.size * pxPerGrid - unitPadding * 2;
      const h = sq.size * pxPerGrid - unitPadding * 2;

      if (w <= 0 || h <= 0) continue;
      ctx.fillStyle = '#F7931A';
      ctx.fillRect(x, y, w, h);
    }
  }, [squares, dataSource]);

  const height = blockHeight.toLocaleString('en-US');
  const count = txCount !== null ? txCount.toLocaleString('en-US') : null;
  const caption = [`${height}.bitmap`, count !== null ? `${count} transactions` : null, estimated ? 'Estimated layout' : null]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <section
      ref={sectionRef}
      data-testid="world-flat-map"
      aria-label="Flat map"
      tabIndex={-1}
      className="bp-dark relative flex flex-col items-center gap-4 p-4 outline-none"
    >
      {dataSource === 'real' && (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Flat map of block ${height}${count !== null ? `: ${count} parcels` : ''}`}
          className="rounded-lg border-2 border-line-2"
          style={{
            imageRendering: 'pixelated',
            width: 'min(70vh, 576px, calc(100vw - 32px))',
            height: 'min(70vh, 576px, calc(100vw - 32px))',
          }}
        />
      )}
      {dataSource === 'loading' && <p role="status" className="text-[14px] text-text-2">Loading the block…</p>}
      {dataSource === 'mock' && <p className="text-[14px] text-text-2">The block&apos;s data didn&apos;t load.</p>}
      {dataSource === 'mock' && (
        <button type="button" onClick={onRetry} className={`${secondaryButton} ${ring}`}>
          Try again
        </button>
      )}
      <p className="font-mono text-[12px] text-text-3">{caption}</p>
    </section>
  );
}
