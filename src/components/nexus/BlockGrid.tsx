"use client";

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";

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

const ERAS = [
  { max: 209999, color: "#c98923", label: "Epoch 1", sub: "The Genesis Era", reward: "50 BTC" },
  { max: 419999, color: "#f28b2b", label: "Epoch 2", sub: "The Growth Era", reward: "25 BTC" },
  { max: 629999, color: "#2bff6b", label: "Epoch 3", sub: "The Expansion Era", reward: "12.5 BTC" },
  { max: 839999, color: "#2bc9ff", label: "Epoch 4", sub: "The Adoption Era", reward: "6.25 BTC" },
  { max: Number.POSITIVE_INFINITY, color: "#a855f7", label: "Epoch 5", sub: "The Scarcity Era", reward: "3.125 BTC" },
];

const getEra = (height: number) => ERAS.find((e) => height <= e.max) ?? ERAS[0];
const getEraColor = (height: number) => getEra(height).color;

// Deterministic pseudo-random from block height for consistent heights
const hashHeight = (h: number) => {
  const x = Math.sin(h * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x); // 0-1
};

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

  const { blocks, baseColors, activeIndices, spacing, eraLabels } = useMemo(() => {
    const half = Math.floor(gridSize / 2);
    const spacingValue = blockSize * 1.25;
    const centerRow = Math.floor(centerHeight / 1000);
    const centerCol = ((centerHeight % 1000) + 1000) % 1000;

    const computedBlocks: Array<{ height: number; position: THREE.Vector3; yScale: number }> = [];
    const colors: THREE.Color[] = [];

    // Track era boundaries for labels
    const eraBoundaries: Map<string, { x: number; z: number; count: number; era: typeof ERAS[0] }> = new Map();

    for (let row = 0; row < gridSize; row += 1) {
      for (let col = 0; col < gridSize; col += 1) {
        const rowOffset = row - half;
        const colOffset = col - half;
        let targetRow = centerRow + rowOffset;
        let targetCol = centerCol + colOffset;

        while (targetCol < 0) {
          targetCol += 1000;
          targetRow -= 1;
        }
        while (targetCol >= 1000) {
          targetCol -= 1000;
          targetRow += 1;
        }

        const height = Math.max(targetRow * 1000 + targetCol, 0);

        // Varying height: 0.2 - 1.2 based on block hash, with some special tall ones
        const h = hashHeight(height);
        const yScale = 0.2 + h * 0.8 + (h > 0.95 ? 1.5 : 0); // occasional tall towers

        const position = new THREE.Vector3(
          colOffset * spacingValue,
          yScale * blockSize * 0.175, // lift based on height
          rowOffset * spacingValue
        );

        computedBlocks.push({ height, position, yScale });
        colors.push(new THREE.Color(getEraColor(height)));

        // Track era centers for labels
        const era = getEra(height);
        const key = era.label;
        const existing = eraBoundaries.get(key);
        if (existing) {
          existing.x += colOffset * spacingValue;
          existing.z += rowOffset * spacingValue;
          existing.count += 1;
        } else {
          eraBoundaries.set(key, { x: colOffset * spacingValue, z: rowOffset * spacingValue, count: 1, era });
        }
      }
    }

    // Compute era label positions (center of each era's blocks)
    const labels = Array.from(eraBoundaries.entries()).map(([, val]) => ({
      x: val.x / val.count,
      z: val.z / val.count,
      era: val.era,
      count: val.count,
    })).filter((l) => l.count > gridSize * 2); // Only show labels for eras with significant presence

    const total = gridSize * gridSize;
    const active = new Set<number>();
    while (active.size < Math.min(300, total)) {
      active.add(Math.floor(Math.random() * total));
    }

    return {
      blocks: computedBlocks,
      baseColors: colors,
      activeIndices: Array.from(active),
      spacing: spacingValue,
      eraLabels: labels,
    };
  }, [blockSize, centerHeight, gridSize]);

  useEffect(() => {
    if (!meshRef.current) return;
    blocks.forEach((block, index) => {
      dummy.position.copy(block.position);
      dummy.scale.set(blockSize, blockSize * 0.35 * block.yScale, blockSize);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(index, baseColors[index]);
    });
    if (meshRef.current.instanceMatrix) {
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [blocks, baseColors, blockSize, dummy]);

  useFrame(({ clock }) => {
    if (!meshRef.current?.instanceColor) return;
    const t = clock.getElapsedTime();
    const pulse = Math.sin(t * 2) * 0.3 + 0.4;
    const breathe = Math.sin(t * 0.5) * 0.1 + 0.9;
    const tempColor = new THREE.Color();

    activeIndices.forEach((index) => {
      tempColor.copy(baseColors[index]);
      tempColor.lerp(new THREE.Color("#ffffff"), pulse * 0.5);
      meshRef.current?.setColorAt(index, tempColor);
    });

    // Subtle global breathing effect on emissive
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.emissiveIntensity = breathe * 0.15;
    }

    meshRef.current.instanceColor.needsUpdate = true;
  });

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    if (event.instanceId !== hoveredIndex) {
      setHoveredIndex(event.instanceId);
    }
    if (onHover) {
      const target = blocks[event.instanceId];
      if (target) {
        onHover({ height: target.height, x: event.clientX, y: event.clientY });
      }
    }
  };

  const handlePointerOut = () => {
    setHoveredIndex(null);
    onHover?.(null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined) return;
    const target = blocks[event.instanceId];
    if (target) {
      onSelect?.(target.height);
    }
  };

  const hoveredBlock = hoveredIndex !== null ? blocks[hoveredIndex] : null;

  return (
    <group>
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

      {/* Era labels floating above the grid */}
      {eraLabels.map((label) => (
        <group key={label.era.label} position={[label.x, blockSize * 3, label.z]}>
          <Text
            fontSize={blockSize * 2.5}
            color={label.era.color}
            anchorX="center"
            anchorY="middle"
            font={undefined}
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {label.era.label}
          </Text>
          <Text
            fontSize={blockSize * 1.0}
            color={label.era.color}
            anchorX="center"
            anchorY="middle"
            position={[0, -blockSize * 2, 0]}
            font={undefined}
            outlineWidth={0.01}
            outlineColor="#000000"
            fillOpacity={0.6}
          >
            {label.era.sub} · {label.era.reward}
          </Text>
        </group>
      ))}

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -blockSize * 0.25, 0]}>
        <planeGeometry args={[gridSize * spacing, gridSize * spacing]} />
        <meshStandardMaterial color="#0b0e17" />
      </mesh>
    </group>
  );
}
