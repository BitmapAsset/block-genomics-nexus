"use client";

/**
 * BlockGrid — Universal Bitmap Standard 3D Map
 * 
 * Uses the canonical bitmap.land layout (500 cols × 420 rows per epoch)
 * from @blockamotolabs/react-bitmap-utils, rendered in 3D with Three.js.
 */

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  BLOCKS_PER_EPOCH,
  BLOCKS_PER_ROW,
  BLOCKS_PER_COLUMN,
  BITMAP_ORANGE,
  blockTo2D,
  blockTo3D,
  getEpochIndex,
  getEpochColor,
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

const ESTIMATED_TOTAL_BLOCKS = 885_000;

/**
 * Generate visible blocks around center using a height-based window.
 * This correctly handles epoch boundaries by iterating over block heights
 * rather than 2D grid coordinates.
 */
function computeVisibleBlocks(
  centerHeight: number,
  windowSize: number,
  blockUnit: number,
  totalBlocks: number,
) {
  const blocks: Array<{
    height: number;
    position: THREE.Vector3;
    yScale: number;
    epochIndex: number;
  }> = [];
  const colors: THREE.Color[] = [];
  
  // Calculate block range: windowSize^2 blocks centered on centerHeight
  const totalVisible = windowSize * windowSize;
  const halfVisible = Math.floor(totalVisible / 2);
  const startHeight = Math.max(0, centerHeight - halfVisible);
  const endHeight = Math.min(totalBlocks, centerHeight + halfVisible);

  // Center position for offset
  const centerPos = blockTo3D(centerHeight, blockUnit, 0.08);
  const epochBounds = new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number }>();

  for (let h = startHeight; h < endHeight; h++) {
    const pos3D = blockTo3D(h, blockUnit, 0.08);
    const rand = hashHeight(h);
    const yScale = 0.15 + rand * 0.85 + (rand > 0.97 ? 2.0 : 0);
    const epochIdx = getEpochIndex(h);

    blocks.push({
      height: h,
      position: new THREE.Vector3(
        pos3D.x - centerPos.x,
        yScale * blockUnit * 0.175,
        pos3D.z - centerPos.z
      ),
      yScale,
      epochIndex: epochIdx,
    });

    colors.push(new THREE.Color(getEpochColor(h)));

    // Track epoch bounds for separators
    const existing = epochBounds.get(epochIdx);
    if (existing) {
      existing.minX = Math.min(existing.minX, pos3D.x);
      existing.maxX = Math.max(existing.maxX, pos3D.x);
      existing.minZ = Math.min(existing.minZ, pos3D.z);
      existing.maxZ = Math.max(existing.maxZ, pos3D.z);
    } else {
      epochBounds.set(epochIdx, {
        minX: pos3D.x, maxX: pos3D.x,
        minZ: pos3D.z, maxZ: pos3D.z,
      });
    }
  }

  // Active pulsing blocks (random subset)
  const activeIndices = new Set<number>();
  const total = blocks.length;
  const activeCount = Math.min(200, Math.floor(total * 0.04));
  while (activeIndices.size < activeCount && activeIndices.size < total) {
    activeIndices.add(Math.floor(Math.random() * total));
  }

  // Epoch separator positions
  const separators: Array<{ x: number; zStart: number; zEnd: number }> = [];
  const sortedEpochs = Array.from(epochBounds.keys()).sort((a, b) => a - b);
  for (let i = 1; i < sortedEpochs.length; i++) {
    const prevBounds = epochBounds.get(sortedEpochs[i - 1])!;
    const currBounds = epochBounds.get(sortedEpochs[i])!;
    const sepX = (prevBounds.maxX + currBounds.minX) / 2 - centerPos.x;
    const zStart = Math.min(prevBounds.minZ, currBounds.minZ) - centerPos.z;
    const zEnd = Math.max(prevBounds.maxZ, currBounds.maxZ) - centerPos.z;
    separators.push({ x: sepX, zStart, zEnd: zEnd + blockUnit });
  }

  return { blocks, colors, activeIndices: Array.from(activeIndices), separators };
}

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

  useEffect(() => {
    if (!meshRef.current || blocks.length === 0) return;
    blocks.forEach((block, index) => {
      dummy.position.copy(block.position);
      dummy.scale.set(blockSize, blockSize * 0.35 * block.yScale, blockSize);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(index, baseColors[index]);
    });
    if (meshRef.current.instanceMatrix) meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [blocks, baseColors, blockSize, dummy]);

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

  return (
    <group>
      {blocks.length > 0 && (
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
      )}

      {/* Hover highlight */}
      {hoveredBlock && (
        <mesh
          position={[
            hoveredBlock.position.x,
            hoveredBlock.position.y + blockSize * 0.15,
            hoveredBlock.position.z,
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
        const depth = Math.max(sep.zEnd - sep.zStart, blockSize);
        return (
          <mesh
            key={`sep-${i}`}
            position={[sep.x, blockSize * 0.5, (sep.zStart + sep.zEnd) / 2]}
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
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#0b0e17" />
      </mesh>
    </group>
  );
}
