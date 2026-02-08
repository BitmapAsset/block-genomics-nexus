'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DNAState } from '../DNAVisualizer';

const colorPalette: Record<string, string> = {
  '0': '#ff0055',
  '1': '#ff3366',
  '2': '#ff6633',
  '3': '#ffaa00',
  '4': '#ccff00',
  '5': '#66ff33',
  '6': '#00ff99',
  '7': '#00ffcc',
  '8': '#00ccff',
  '9': '#0099ff',
  'a': '#3366ff',
  'b': '#6633ff',
  'c': '#9933ff',
  'd': '#cc33ff',
  'e': '#ff33cc',
  'f': '#ff3399',
};

interface HelixProps {
  genomeHash: string;
  state: DNAState;
  basePairCount?: number;
  helixRadius?: number;
  helixHeight?: number;
}

const Helix: React.FC<HelixProps> = ({
  genomeHash,
  state,
  basePairCount = 64,
  helixRadius = 2,
  helixHeight = 20,
}) => {
  const basePairRef = useRef<THREE.InstancedMesh>(null);
  const backboneRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const verifiedStart = useRef<number | null>(null);

  const hash = genomeHash.toLowerCase();

  const { baseColors, basePairMatrices, backboneMatrices, glowMatrices } = useMemo(() => {
    const colors: THREE.Color[] = [];
    const bpMatrices: THREE.Matrix4[] = [];
    const bbMatrices: THREE.Matrix4[] = [];
    const gMatrices: THREE.Matrix4[] = [];
    const obj = new THREE.Object3D();

    for (let i = 0; i < basePairCount; i += 1) {
      const t = i / basePairCount;
      const y = (t - 0.5) * helixHeight;
      const angle = t * Math.PI * 6;
      const hexChar = hash[i % hash.length] || '0';
      const color = new THREE.Color(colorPalette[hexChar] || '#ffffff');

      const x1 = Math.cos(angle) * helixRadius;
      const z1 = Math.sin(angle) * helixRadius;
      const x2 = Math.cos(angle + Math.PI) * helixRadius;
      const z2 = Math.sin(angle + Math.PI) * helixRadius;

      const distance = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      obj.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      obj.rotation.set(0, 0, 0);
      obj.lookAt(x1, y, z1);
      obj.rotateX(Math.PI / 2);
      obj.scale.set(1, 1, distance / (helixRadius * 2));
      obj.updateMatrix();
      bpMatrices.push(obj.matrix.clone());
      colors.push(color);

      obj.position.set(x1, y, z1);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
      obj.updateMatrix();
      bbMatrices.push(obj.matrix.clone());
      gMatrices.push(obj.matrix.clone());

      obj.position.set(x2, y, z2);
      obj.updateMatrix();
      bbMatrices.push(obj.matrix.clone());
      gMatrices.push(obj.matrix.clone());
    }

    return {
      baseColors: colors,
      basePairMatrices: bpMatrices,
      backboneMatrices: bbMatrices,
      glowMatrices: gMatrices,
    };
  }, [basePairCount, helixHeight, helixRadius, hash]);

  useEffect(() => {
    if (!basePairRef.current) return;
    basePairMatrices.forEach((m, i) => {
      basePairRef.current!.setMatrixAt(i, m);
    });
    baseColors.forEach((c, i) => {
      basePairRef.current!.setColorAt(i, c);
    });
    basePairRef.current.instanceMatrix.needsUpdate = true;
    if (basePairRef.current.instanceColor) basePairRef.current.instanceColor.needsUpdate = true;
  }, [basePairMatrices, baseColors]);

  useEffect(() => {
    if (!backboneRef.current || !glowRef.current) return;
    backboneMatrices.forEach((m, i) => backboneRef.current!.setMatrixAt(i, m));
    glowMatrices.forEach((m, i) => glowRef.current!.setMatrixAt(i, m));
    backboneRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;

    baseColors.forEach((c, i) => {
      const color = c.clone();
      glowRef.current!.setColorAt(i * 2, color);
      glowRef.current!.setColorAt(i * 2 + 1, color);
    });
    if (glowRef.current.instanceColor) glowRef.current.instanceColor.needsUpdate = true;
  }, [backboneMatrices, glowMatrices, baseColors]);

  useEffect(() => {
    if (state === 'verified') {
      verifiedStart.current = performance.now();
    }
  }, [state]);

  useFrame(({ clock }) => {
    if (!basePairRef.current) return;
    const time = clock.getElapsedTime();
    const pulse = state === 'verifying' ? 0.4 + (Math.sin(time * 6) * 0.5 + 0.5) * 0.6 : 1;

    baseColors.forEach((baseColor, i) => {
      const color = baseColor.clone();
      if (state === 'verifying') {
        color.multiplyScalar(pulse);
      }

      if (state === 'verified' && verifiedStart.current) {
        const elapsed = (performance.now() - verifiedStart.current) / 1000;
        if (elapsed < 2.2) {
          const green = new THREE.Color('#00ff66');
          const mix = Math.sin(elapsed * 8 + i * 0.2) * 0.5 + 0.5;
          color.lerp(green, mix * 0.6);
        }
      }

      if (hovered === i) {
        color.lerp(new THREE.Color('#ffffff'), 0.4);
      }
      basePairRef.current!.setColorAt(i, color);
    });
    if (basePairRef.current.instanceColor) basePairRef.current.instanceColor.needsUpdate = true;
  });

  const backboneCurve = useMemo(() => {
    const makeCurve = (side: 1 | -1) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= basePairCount; i += 1) {
        const t = i / basePairCount;
        const y = (t - 0.5) * helixHeight;
        const angle = t * Math.PI * 6 + (side === -1 ? Math.PI : 0);
        points.push(
          new THREE.Vector3(
            Math.cos(angle) * helixRadius,
            y,
            Math.sin(angle) * helixRadius
          )
        );
      }
      return new THREE.CatmullRomCurve3(points);
    };
    return {
      left: makeCurve(1),
      right: makeCurve(-1),
    };
  }, [basePairCount, helixHeight, helixRadius]);

  return (
    <group>
      <instancedMesh
        ref={backboneRef}
        args={[undefined, undefined, basePairCount * 2]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color="#4488aa"
          metalness={0.5}
          roughness={0.3}
          emissive="#112233"
          emissiveIntensity={0.3}
        />
      </instancedMesh>

      <instancedMesh
        ref={glowRef}
        args={[undefined, undefined, basePairCount * 2]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial vertexColors transparent opacity={0.5} />
      </instancedMesh>

      <instancedMesh
        ref={basePairRef}
        args={[undefined, undefined, basePairCount]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) setHovered(e.instanceId);
        }}
        onPointerOut={() => setHovered(null)}
      >
        <cylinderGeometry args={[0.08, 0.08, helixRadius * 2, 8]} />
        <meshStandardMaterial
          vertexColors
          metalness={0.3}
          roughness={0.4}
          emissive="#ffffff"
          emissiveIntensity={0.4}
          transparent
          opacity={0.9}
        />
      </instancedMesh>

      <mesh>
        <tubeGeometry args={[backboneCurve.left, 100, 0.06, 8, false]} />
        <meshStandardMaterial
          color="#66aacc"
          metalness={0.6}
          roughness={0.2}
          emissive="#224466"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh>
        <tubeGeometry args={[backboneCurve.right, 100, 0.06, 8, false]} />
        <meshStandardMaterial
          color="#66aacc"
          metalness={0.6}
          roughness={0.2}
          emissive="#224466"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
};

export default Helix;
