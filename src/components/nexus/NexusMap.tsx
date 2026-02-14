'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { NexusCanvasEngine, getZoomLevel } from './NexusCanvas';
import NexusStatsBar from './NexusStatsBar';
import NexusSearch from './NexusSearch';
import NexusDetailPanel from './NexusDetailPanel';
import NexusMinimap from './NexusMinimap';
import ActivityFeed from './ActivityFeed';
import BlockSpotlight from './BlockSpotlight';
import UserProfilePopover from './UserProfilePopover';
import ParcelView from './ParcelView';
import { generateBlock } from './NexusBlockData';
import { getLandmark } from './NexusLandmarks';
import { useNexusSocial, type Visitor } from './NexusSocial';

export default function NexusMap({ initialBlock }: { initialBlock?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<NexusCanvasEngine | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null);
  const [engine, setEngine] = useState<NexusCanvasEngine | null>(null);
  const [zoomLevel, setZoomLevel] = useState<string>('galaxy');
  const [hoveredVisitor, setHoveredVisitor] = useState<Visitor | null>(null);
  const [hoveredVisitorPos, setHoveredVisitorPos] = useState({ x: 0, y: 0 });
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [selectedVisitorPos, setSelectedVisitorPos] = useState({ x: 0, y: 0 });
  const [feedOpen, setFeedOpen] = useState(true);
  const [cyberpunk, setCyberpunk] = useState(true);
  const [enteredBlock, setEnteredBlock] = useState<number | null>(null);

  const { visitors, activity, messagesByBlock, sendMessage } = useNexusSocial();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const eng = new NexusCanvasEngine(canvas);
    engineRef.current = eng;
    setEngine(eng);

    eng.setCallbacks(
      (h) => {
        setSelectedBlock(h);
        setSelectedVisitor(null);
      },
      (h) => setHoveredBlock(h),
      (visitor, x, y) => {
        if (visitor) {
          setSelectedVisitor(visitor);
          setSelectedVisitorPos({ x, y });
        } else {
          setSelectedVisitor(null);
        }
      },
      (visitor, x, y) => {
        setHoveredVisitor(visitor);
        setHoveredVisitorPos({ x, y });
      },
    );

    eng.setOnBlockEnter((h) => setEnteredBlock(h));
    eng.resize();
    eng.setCyberpunk(true);
    eng.start();

    // Auto-navigate to block from URL param
    if (initialBlock !== undefined && initialBlock >= 0) {
      setTimeout(() => {
        eng.navigateToBlock(initialBlock);
        eng.selectBlock(initialBlock);
        setEnteredBlock(initialBlock);
      }, 500);
    }

    const onResize = () => eng.resize();
    window.addEventListener('resize', onResize);

    // Zoom level tracking
    const zoomCheck = setInterval(() => {
      const cam = eng.getCamera();
      setZoomLevel(getZoomLevel(cam.zoom));
    }, 200);

    // Event listeners
    const handleWheel = (e: WheelEvent) => eng.handleWheel(e);
    const handleMouseDown = (e: MouseEvent) => eng.handleMouseDown(e);
    const handleMouseMove = (e: MouseEvent) => eng.handleMouseMove(e);
    const handleMouseUp = (e: MouseEvent) => eng.handleMouseUp(e);
    const handleTouchStart = (e: TouchEvent) => eng.handleTouchStart(e);
    const handleTouchMove = (e: TouchEvent) => eng.handleTouchMove(e);
    const handleTouchEnd = (e: TouchEvent) => eng.handleTouchEnd(e);

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      eng.stop();
      clearInterval(zoomCheck);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setVisitors(visitors);
  }, [visitors]);

  const handleSearch = useCallback((height: number) => {
    engineRef.current?.navigateToBlock(height);
    engineRef.current?.selectBlock(height);
  }, []);

  const handleClosePanel = useCallback(() => {
    engineRef.current?.selectBlock(null);
    setSelectedBlock(null);
  }, []);

  // Tooltip for hovered block
  const hoveredData = hoveredBlock !== null ? generateBlock(hoveredBlock) : null;
  const hoveredLandmark = hoveredBlock !== null ? getLandmark(hoveredBlock) : null;

  // If inside a block, render ParcelView
  if (enteredBlock !== null) {
    return (
      <ParcelView
        blockHeight={enteredBlock}
        onBack={() => {
          setEnteredBlock(null);
          // Reset zoom below auto-enter threshold so map doesn't re-trigger
          engineRef.current?.setZoom(12);
        }}
      />
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Stats bar + search */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between">
        <NexusStatsBar />
        <div className="pr-4 py-2" style={{ background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(8px)' }}>
          <NexusSearch onSearch={handleSearch} />
        </div>
      </div>

      {/* Zoom level indicator + cyberpunk toggle */}
      <div className="absolute top-12 left-4 z-20 flex items-center gap-2">
        <div className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-widest" style={{ color: '#64748b', background: 'rgba(10,10,15,0.6)' }}>
          {zoomLevel} view
        </div>
        <button
          onClick={() => {
            const next = !cyberpunk;
            setCyberpunk(next);
            engineRef.current?.setCyberpunk(next);
          }}
          className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
          style={{
            background: cyberpunk ? 'rgba(255,0,100,0.15)' : 'rgba(10,10,15,0.6)',
            border: cyberpunk ? '1px solid rgba(255,0,100,0.4)' : '1px solid rgba(100,116,139,0.3)',
            color: cyberpunk ? '#ff0064' : '#64748b',
            textShadow: cyberpunk ? '0 0 8px rgba(255,0,100,0.6)' : 'none',
          }}
        >
          ⚡ {cyberpunk ? 'CYBER' : 'CLEAN'}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      />

      {/* Hover tooltip */}
      {hoveredData && zoomLevel !== 'galaxy' && (
        <div className="absolute bottom-16 left-4 z-20 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'rgba(12,12,20,0.9)', border: '1px solid rgba(102,204,255,0.15)', backdropFilter: 'blur(8px)', color: '#e2e8f0' }}>
          <div className="flex items-center flex-wrap gap-x-2">
            <span style={{ color: '#66ccff' }}>#{hoveredData.height.toLocaleString()}</span>
            <span className="text-[#64748b]">|</span>
            <span>{hoveredData.txCount.toLocaleString()} parcels (child inscriptions)</span>
            <span className="text-[#64748b]">|</span>
            <span style={{ color: hoveredData.claimed ? '#22c55e' : '#64748b' }}>{hoveredData.claimed ? '● Claimed' : '○ Unclaimed'}</span>
          </div>
          {hoveredLandmark && (
            <div className="mt-1 text-[10px] text-[#fbbf24]">✨ {hoveredLandmark.title}</div>
          )}
        </div>
      )}

      {/* Hovered visitor tooltip */}
      {hoveredVisitor && (
        <div
          className="absolute z-30 px-2 py-1 rounded text-[10px] font-mono"
          style={{
            left: hoveredVisitorPos.x + 12,
            top: hoveredVisitorPos.y + 12,
            background: 'rgba(12,12,20,0.85)',
            border: '1px solid rgba(102,204,255,0.3)',
            color: '#e2e8f0',
          }}
        >
          {hoveredVisitor.username}
        </div>
      )}

      {/* Minimap */}
      <NexusMinimap engine={engine} />

      {/* Block Spotlight — Discovery Panel */}
      <BlockSpotlight onNavigateToBlock={handleSearch} />

      {/* Activity Feed */}
      <ActivityFeed open={feedOpen} events={activity} onToggle={() => setFeedOpen((v) => !v)} />

      {/* User Profile Popover */}
      {selectedVisitor && (
        <UserProfilePopover
          visitor={selectedVisitor}
          position={selectedVisitorPos}
          onClose={() => setSelectedVisitor(null)}
        />
      )}

      {/* Detail panel */}
      <NexusDetailPanel
        height={selectedBlock}
        onClose={handleClosePanel}
        visitorCount={selectedBlock !== null ? (engineRef.current?.getVisitorCount(selectedBlock) ?? 0) : 0}
        messages={selectedBlock !== null ? messagesByBlock[selectedBlock] ?? [] : []}
        onSendMessage={(text) => {
          if (selectedBlock !== null) sendMessage(selectedBlock, text);
        }}
        onEnterBlock={(h) => setEnteredBlock(h)}
      />
    </div>
  );
}
