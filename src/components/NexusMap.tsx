"use client";

import { useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
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
  const [detailLevel, setDetailLevel] = useState<"far" | "mid" | "near">(
    "mid"
  );
  const [searchValue, setSearchValue] = useState("");

  const gridSize = useMemo(() => {
    if (detailLevel === "far") return 50;
    if (detailLevel === "near") return 100;
    return 80;
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

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-6 top-6 z-20">
        <div className="text-lg font-semibold text-white">The Nexus</div>
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
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
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

        <EffectComposer>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.6} intensity={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
