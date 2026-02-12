'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { NexusCanvasEngine } from './NexusCanvas';

interface Props {
  engine: NexusCanvasEngine | null;
}

export default function NexusMinimap({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!engine || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let animId: number;
    const render = () => {
      engine.renderMinimap(canvas);
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [engine]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engine || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    engine.minimapClick(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );
  }, [engine]);

  return (
    <div
      className="absolute bottom-4 right-4 rounded-lg overflow-hidden"
      style={{
        background: 'rgba(10,10,15,0.8)',
        border: '1px solid rgba(102,204,255,0.15)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={120}
        height={160}
        onClick={handleClick}
        className="cursor-pointer"
        style={{ width: 120, height: 160 }}
      />
    </div>
  );
}
