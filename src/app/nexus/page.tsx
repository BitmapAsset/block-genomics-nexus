"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

const NexusMap = dynamic(() => import("@/components/nexus/NexusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full" style={{ background: '#0a0a0f' }}>
      <div className="text-center">
        <div className="text-2xl font-mono font-bold mb-2" style={{ color: '#66ccff' }}>The Nexus</div>
        <div className="text-xs font-mono" style={{ color: '#64748b' }}>Loading block map...</div>
      </div>
    </div>
  ),
});

const NexusWarpEntry = dynamic(() => import("@/components/nexus/NexusWarpEntry"), {
  ssr: false,
});

const SESSION_KEY = "nexus_entered";

function NexusContent() {
  const searchParams = useSearchParams();
  const blockParam = searchParams.get('block');
  const initialBlock = blockParam ? parseInt(blockParam, 10) : undefined;

  // Show warp intro once per session
  const [showWarp, setShowWarp] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Check if already entered this session
    const entered = sessionStorage.getItem(SESSION_KEY);
    if (entered) {
      setMapReady(true);
    } else {
      setShowWarp(true);
    }
  }, []);

  const handleWarpComplete = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setShowWarp(false);
    setMapReady(true);
  }, []);

  // ESC to skip
  useEffect(() => {
    if (!showWarp) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleWarpComplete();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showWarp, handleWarpComplete]);

  return (
    <>
      {showWarp && <NexusWarpEntry onComplete={handleWarpComplete} />}
      <section
        className="w-full overflow-hidden transition-opacity duration-1000"
        style={{
          background: '#0a0a0f',
          height: 'calc(100dvh - 4rem)',
          opacity: mapReady ? 1 : 0,
        }}
      >
        {(mapReady || showWarp) && (
          <NexusMap initialBlock={isNaN(initialBlock as number) ? undefined : initialBlock} />
        )}
      </section>
    </>
  );
}

export default function NexusPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-4rem)] w-full" style={{ background: '#0a0a0f' }} />}>
      <NexusContent />
    </Suspense>
  );
}
