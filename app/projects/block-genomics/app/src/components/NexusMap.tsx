"use client";

import { useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useRouter } from "next/navigation";
import BlockGrid from "@/components/nexus/BlockGrid";

const DEFAULT_CENTER = 840000;

type HoverInfo = {
  height: number;
  x: number;
  y: number;
} | null;

export default function NexusMap() {
  const router = useRouter();
  const [centerHeight, setCenterHeight] = useState(DEFAULT_CENTER);
  const [hover, setHover] = useState<HoverInfo>(null);
  const [detailLevel, setDetailLevel] = useState<"far" | "mid" | "near">("mid");
  const [searchValue, setSearchValue] = useState("");

  // Small grid sizes to keep it fast on all devices
  const gridSize = useMemo(() => {
    if (detailLevel === "far") return 20;
    if (detailLevel === "near") return 35;
    return 25;
  }, [detailLevel]);

  const blockSize = useMemo(() => {
    if (detailLevel === "far") return 0.5;
    if (detailLevel === "near") return 1.1;
    return 0.8;
  }, [detailLevel]);

  const handleZoomChange = useCallback((zoom: number) => {
    if (zoom < 18) {
      setDetailLevel("far");
      return;
    }
    if (zoom > 38) {
      setDetailLevel("near");
      return;
    }
    setDetailLevel("mid");
  }, []);

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = Number.parseInt(searchValue, 10);
      if (!Number.isNaN(value) && value >= 0) {
        setCenterHeight(value);
      }
    },
    [searchValue]
  );

  const epochs = [
    { label: "Epoch 1", range: "0 – 209,999", color: "#f7931a", reward: "50 BTC" },
    { label: "Epoch 2", range: "210K – 419,999", color: "#66ccff", reward: "25 BTC" },
    { label: "Epoch 3", range: "420K – 629,999", color: "#a855f7", reward: "12.5 BTC" },
    { label: "Epoch 4", range: "630K – 839,999", color: "#22c55e", reward: "6.25 BTC" },
    { label: "Epoch 5", range: "840K +", color: "#10b981", reward: "3.125 BTC" },
  ];

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-6 top-6 z-20">
        <div className="text-lg font-semibold text-white">The Nexus</div>
      </div>

      {/* Epoch Legend */}
      <div className="absolute right-4 top-4 z-20 rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm px-3 py-2.5 space-y-1.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Bitcoin Epochs</div>
        {epochs.map((e) => (
          <div key={e.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: e.color, boxShadow: `0 0 6px ${e.color}40` }} />
            <span className="text-[11px] font-semibold text-white/90">{e.label}</span>
            <span className="text-[10px] text-white/40">{e.reward}</span>
          </div>
        ))}
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-white/20 bg-black/70 px-3 py-1 text-xs text-white/90"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          Block #{hover.height.toLocaleString()}
        </div>
      )}

      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        className="h-full w-full"
      >
        <color attach="background" args={["#0a0a0f"]} />
        <ambientLight intensity={0.7} color="#4f587a" />
        <directionalLight position={[10, 20, 10]} intensity={1.2} />

        <OrthographicCamera makeDefault position={[0, 120, 120]} zoom={28} />

        <OrbitControls
          enableRotate
          enablePan
          enableZoom
          minZoom={10}
          maxZoom={60}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={Math.PI / 3}
          onChange={(event) =>
            handleZoomChange(event?.target?.object?.zoom ?? 28)
          }
        />

        <BlockGrid
          centerHeight={centerHeight}
          gridSize={gridSize}
          blockSize={blockSize}
          onHover={setHover}
          onSelect={(height) => router.push(`/block/${height}`)}
        />

        {/* No Bloom — saves significant GPU on all devices */}
      </Canvas>
    </div>
  );
}
