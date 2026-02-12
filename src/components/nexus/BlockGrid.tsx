"use client";

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

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

const ERA_COLORS = [
  { max: 209999, color: "#c98923" },
  { max: 419999, color: "#f28b2b" },
  { max: 629999, color: "#2bff6b" },
  { max: 839999, color: "#2bc9ff" },
  { max: Number.POSITIVE_INFINITY, color: "#a855f7" },
];

const getEraColor = (height: number) => {
  const era = ERA_COLORS.find((entry) => height <= entry.max) ?? ERA_COLORS[0];
  return era.color;
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

  const { blocks, baseColors, activeIndices, spacing } = useMemo(() => {
    const half = Math.floor(gridSize / 2);
    const spacingValue = blockSize * 1.25;
    const centerRow = Math.floor(centerHeight / 1000);
    const centerCol = ((centerHeight % 1000) + 1000) % 1000;

    const computedBlocks: Array<{ height: number; position: THREE.Vector3 }> = [];
    const colors: THREE.Color[] = [];

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
        const position = new THREE.Vector3(
          colOffset * spacingValue,
          0,
          rowOffset * spacingValue
        );

        computedBlocks.push({ height, position });
        colors.push(new THREE.Color(getEraColor(height)));
      }
    }

    const total = gridSize * gridSize;
    const active = new Set<number>();
    while (active.size < Math.min(200, total)) {
      active.add(Math.floor(Math.random() * total));
    }

    return {
      blocks: computedBlocks,
      baseColors: colors,
      activeIndices: Array.from(active),
      spacing: spacingValue,
    };
  }, [blockSize, centerHeight, gridSize]);

  useEffect(() => {
    if (!meshRef.current) return;
    blocks.forEach((block, index) => {
      dummy.position.copy(block.position);
      dummy.scale.set(blockSize, blockSize * 0.35, blockSize);
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
    const pulse = Math.sin(clock.getElapsedTime() * 2) * 0.3 + 0.4;
    const tempColor = new THREE.Color();
    activeIndices.forEach((index) => {
      tempColor.copy(baseColors[index]);
      tempColor.lerp(new THREE.Color("#ffffff"), pulse);
      meshRef.current?.setColorAt(index, tempColor);
    });
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

  const hoveredPosition = hoveredIndex !== null ? blocks[hoveredIndex]?.position : null;

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
          roughness={0.6}
          metalness={0.2}
          emissive="#0a0a0f"
        />
      </instancedMesh>

      {hoveredPosition && (
        <mesh
          position={[
            hoveredPosition.x,
            hoveredPosition.y + blockSize * 0.25,
            hoveredPosition.z,
          ]}
        >
          <boxGeometry args={[blockSize * 1.25, blockSize * 0.5, blockSize * 1.25]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#6ee7ff"
            emissiveIntensity={1.2}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -blockSize * 0.25, 0]}>
        <planeGeometry args={[gridSize * spacing, gridSize * spacing]} />
        <meshStandardMaterial color="#0b0e17" />
      </mesh>
    </group>
  );
}
