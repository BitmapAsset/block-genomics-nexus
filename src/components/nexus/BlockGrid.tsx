"use client";

/**
 * BlockGrid — Universal Bitmap Standard 3D Map
 * 
 * Uses the canonical bitmap.land layout (500 cols × 420 rows per epoch)
 * from @blockamotolabs/react-bitmap-utils, rendered in 3D with Three.js.
 * 
 * LOD system:
 *   Far  → flat colored blocks (bitmap.land style, overhead)
 *   Mid  → extruded blocks with height variation
 *   Near → full detail with glow, labels, bitmap thumbnails
 */

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  BLOCKS_PER_EPOCH,
  BLOCKS_PER_ROW,
  BLOCKS_PER_COLUMN,
  EPOCH_COLORS,
  EPOCH_LABELS,
  BITMAP_ORANGE,
  blockTo2D,
  blockTo3D,
  getEpochIndex,
  getEpochColor,
  gridToBlock,
} from "@/lib/bitmapStandard";

type HoverPayload = {
  height: number;
  x: number;
  y: number;
} | null;

interface BlockGridProps {
  centerHeight: number;
  gridSize: number;
  blockSize: number;
  onHover?: (payload: HoverPayload) => void;
  onSelect?: (height: number) => void;
}

// Deterministic pseudo-random from block height
const hashHeight = (h: number) => {
  const x = Math.sin(h * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ── Windowed block loading ───────────────────────────────────────────
// We only render a window of blocks around the camera center.
// bitmap.land uses a 50×50 window — we do similar but in 3D.

function computeVisibleBlocks(
  centerHeight: number,
  windowSize: number,
  blockUnit: number,
  totalBlocks: number,
) {
  const center2D = blockTo2D(Math.min(centerHeight, totalBlocks - 1));
  const half = Math.floor(windowSize / 2);

  const blocks: Array<{
    height: number;
    position: THREE.Vector3;
    yScale: number;
    epochIndex: number;
  }> = [];
  const colors: THREE.Color[] = [];
  const epochBounds = new Map<number, { minCol: number; maxCol: number; minRow: number; maxRow: number }>();

  for (let dr = -half; dr < half; dr++) {
    for (let dc = -half; dc < half; dc++) {
      const globalCol = center2D.col + dc;
      const globalRow = center2D.row + dr;

      // Bounds check
      if (globalRow < 0 || globalRow >= BLOCKS_PER_COLUMN || globalCol < 0) continue;

      const epochIdx = Math.floor(globalCol / BLOCKS_PER_ROW);
      const colInEpoch = globalCol - epochIdx * BLOCKS_PER_ROW;
      if (colInEpoch < 0 || colInEpoch >= BLOCKS_PER_ROW) continue;

      const height = epochIdx * BLOCKS_PER_EPOCH + globalRow * BLOCKS_PER_ROW + colInEpoch;
      if (height < 0 || height >= totalBlocks) continue;

      // Position using canonical layout
      const pos3D = blockTo3D(height, blockUnit, 0.08);
      const h = hashHeight(height);
      const yScale = 0.15 + h * 0.85 + (h > 0.97 ? 2.0 : 0);

      blocks.push({
        height,
        position: new THREE.Vector3(pos3D.x, pos3D.y + yScale * blockUnit * 0.175, pos3D.z),
        yScale,
        epochIndex: epochIdx,
      });

      const color = getEpochColor(height);
      colors.push(new THREE.Color(color));

      // Track epoch bounds for separators
      const existing = epochBounds.get(epochIdx);
      if (existing) {
        existing.minCol = Math.min(existing.minCol, globalCol);
        existing.maxCol = Math.max(existing.maxCol, globalCol);
        existing.minRow = Math.min(existing.minRow, globalRow);
        existing.maxRow = Math.max(existing.maxRow, globalRow);
      } else {
        epochBounds.set(epochIdx, {
          minCol: globalCol, maxCol: globalCol,
          minRow: globalRow, maxRow: globalRow,
        });
      }
    }
  }

  // Active pulsing blocks (random subset)
  const activeIndices = new Set<number>();
  const total = blocks.length;
  const activeCount = Math.min(300, Math.floor(total * 0.05));
  while (activeIndices.size < activeCount && activeIndices.size < total) {
    activeIndices.add(Math.floor(Math.random() * total));
  }

  // Epoch separator positions (walls between epochs)
  const separators: Array<{ x: number; zStart: number; zEnd: number }> = [];
  epochBounds.forEach((bounds, epochIdx) => {
    if (epochIdx === 0) return;
    const sepCol = epochIdx * BLOCKS_PER_ROW;
    const sepPos = blockTo3D(epochIdx * BLOCKS_PER_EPOCH, blockUnit, 0.08);
    separators.push({
      x: sepPos.x - blockUnit * 0.6,
      zStart: bounds.minRow * blockUnit * 1.08,
      zEnd: (bounds.maxRow + 1) * blockUnit * 1.08,
    });
  });

  return { blocks, colors, activeIndices: Array.from(activeIndices), separators };
}

// ── Estimated total blocks (updates can come from API) ───────────────
const ESTIMATED_TOTAL_BLOCKS = 885_000; // ~current tip, will be overridden

export default function BlockGrid({
  centerHeight,
  gridSize,
  blockSize,
  onHover,
  onSelect,
}: BlockGridProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const { blocks, colors: baseColors, activeIndices, separators } = useMemo(
    () => computeVisibleBlocks(centerHeight, gridSize, blockSize, ESTIMATED_TOTAL_BLOCKS),
    [centerHeight, gridSize, blockSize]
  );

  // Center the view around the camera
  const centerOffset = useMemo(() => {
    if (blocks.length === 0) return new THREE.Vector3();
    const center3D = blockTo3D(centerHeight, blockSize, 0.08);
    return new THREE.Vector3(-center3D.x, 0, -center3D.z);
  }, [centerHeight, blockSize, blocks.length]);

  useEffect(() => {
    if (!meshRef.current) return;
    blocks.forEach((block, index) => {
      dummy.position.set(
        block.position.x + centerOffset.x,
        block.position.y,
        block.position.z + centerOffset.z
      );
      dummy.scale.set(blockSize, blockSize * 0.35 * block.yScale, blockSize);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(index, baseColors[index]);
    });
    if (meshRef.current.instanceMatrix) meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [blocks, baseColors, blockSize, dummy, centerOffset]);

  // Animation: pulsing active blocks + breathing
  useFrame(({ clock }) => {
    if (!meshRef.current?.instanceColor) return;
    const t = clock.getElapsedTime();
    const pulse = Math.sin(t * 2) * 0.3 + 0.4;
    const breathe = Math.sin(t * 0.5) * 0.1 + 0.9;
    const tempColor = new THREE.Color();

    activeIndices.forEach((index) => {
      if (index >= baseColors.length) return;
      tempColor.copy(baseColors[index]);
      tempColor.lerp(new THREE.Color("#ffffff"), pulse * 0.5);
      meshRef.current?.setColorAt(index, tempColor);
    });

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (mat) mat.emissiveIntensity = breathe * 0.15;
    meshRef.current.instanceColor.needsUpdate = true;
  });

  // ── Interaction handlers ──
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    if (event.instanceId !== hoveredIndex) setHoveredIndex(event.instanceId);
    if (onHover && blocks[event.instanceId]) {
      onHover({
        height: blocks[event.instanceId].height,
        x: event.clientX,
        y: event.clientY,
      });
    }
  };

  const handlePointerOut = () => {
    setHoveredIndex(null);
    onHover?.(null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined) return;
    if (blocks[event.instanceId]) onSelect?.(blocks[event.instanceId].height);
  };

  const hoveredBlock = hoveredIndex !== null ? blocks[hoveredIndex] : null;
  const spacing = blockSize * 1.08;

  return (
    <group>
      {/* Main instanced mesh */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, blocks.length]}
        frustumCulled
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.5}
          metalness={0.3}
          emissive="#0a0a0f"
          emissiveIntensity={0.1}
        />
      </instancedMesh>

      {/* Hover highlight */}
      {hoveredBlock && (
        <mesh
          position={[
            hoveredBlock.position.x + centerOffset.x,
            hoveredBlock.position.y + blockSize * 0.15,
            hoveredBlock.position.z + centerOffset.z,
          ]}
        >
          <boxGeometry args={[blockSize * 1.3, blockSize * 0.5 * hoveredBlock.yScale, blockSize * 1.3]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#6ee7ff"
            emissiveIntensity={1.5}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* Epoch separators — glowing walls between epochs */}
      {separators.map((sep, i) => {
        const depth = sep.zEnd - sep.zStart;
        return (
          <mesh
            key={`sep-${i}`}
            position={[
              sep.x + centerOffset.x,
              blockSize * 0.5,
              (sep.zStart + sep.zEnd) / 2 + centerOffset.z,
            ]}
          >
            <boxGeometry args={[blockSize * 0.08, blockSize * 2, depth]} />
            <meshStandardMaterial
              color={BITMAP_ORANGE}
              emissive={BITMAP_ORANGE}
              emissiveIntensity={0.8}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -blockSize * 0.25, 0]}>
        <planeGeometry args={[gridSize * spacing * 2, gridSize * spacing * 2]} />
        <meshStandardMaterial color="#0b0e17" />
      </mesh>
    </group>
  );
}
