'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DNAState } from '../DNAVisualizer';

interface HelixProps {
  genomeHash: string;
  state: DNAState;
}

/* ── colour palette keyed by hex char ── */
const hexPalette: Record<string, string> = {
  '0': '#ff0055', '1': '#ff3366', '2': '#ff6633', '3': '#ffaa00',
  '4': '#ccff00', '5': '#66ff33', '6': '#00ff99', '7': '#00ffcc',
  '8': '#00ccff', '9': '#0099ff', 'a': '#3366ff', 'b': '#6633ff',
  'c': '#9933ff', 'd': '#cc33ff', 'e': '#ff33cc', 'f': '#ff3399',
};

const BASE_PAIR_COUNT = 64;
const HELIX_RADIUS = 2;
const HELIX_HEIGHT = 20;
const TURNS = 3; // 3 full turns → angle = t * PI * 6

const Helix: React.FC<HelixProps> = ({ genomeHash, state }) => {
  const groupRef = useRef<THREE.Group>(null);
  const basePairRefs = useRef<THREE.Mesh[]>([]);
  const verifyInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const hash = genomeHash.toLowerCase().padEnd(64, '0');

  /* ── backbone curves ── */
  const { curveA, curveB } = useMemo(() => {
    const ptsA: THREE.Vector3[] = [];
    const ptsB: THREE.Vector3[] = [];
    const segments = 256;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * HELIX_HEIGHT;
      const angle = t * Math.PI * 2 * TURNS;
      ptsA.push(new THREE.Vector3(Math.cos(angle) * HELIX_RADIUS, y, Math.sin(angle) * HELIX_RADIUS));
      ptsB.push(new THREE.Vector3(Math.cos(angle + Math.PI) * HELIX_RADIUS, y, Math.sin(angle + Math.PI) * HELIX_RADIUS));
    }
    return {
      curveA: new THREE.CatmullRomCurve3(ptsA),
      curveB: new THREE.CatmullRomCurve3(ptsB),
    };
  }, []);

  /* ── base pair data ── */
  const basePairs = useMemo(() => {
    const pairs: {
      pos: THREE.Vector3;
      lookAt: THREE.Vector3;
      length: number;
      color: THREE.Color;
      s1: THREE.Vector3;
      s2: THREE.Vector3;
      index: number;
    }[] = [];

    for (let i = 0; i < BASE_PAIR_COUNT; i++) {
      const t = i / BASE_PAIR_COUNT;
      const y = (t - 0.5) * HELIX_HEIGHT;
      const angle = t * Math.PI * 2 * TURNS;

      const x1 = Math.cos(angle) * HELIX_RADIUS;
      const z1 = Math.sin(angle) * HELIX_RADIUS;
      const x2 = Math.cos(angle + Math.PI) * HELIX_RADIUS;
      const z2 = Math.sin(angle + Math.PI) * HELIX_RADIUS;

      const hexChar = hash[i % hash.length];
      const color = new THREE.Color(hexPalette[hexChar] || '#ffffff');

      const dist = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);

      pairs.push({
        pos: new THREE.Vector3((x1 + x2) / 2, y, (z1 + z2) / 2),
        lookAt: new THREE.Vector3(x1, y, z1),
        length: dist,
        color,
        s1: new THREE.Vector3(x1, y, z1),
        s2: new THREE.Vector3(x2, y, z2),
        index: i,
      });
    }
    return pairs;
  }, [hash]);

  /* ── animate ── */
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Gentle wobble
    if (groupRef.current) {
      groupRef.current.rotation.x = Math.sin(t * 0.5) * 0.1;
    }

    // State-driven emissive pulse
    basePairRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (state === 'verifying') {
        const pulse = Math.sin(t * 6 + i * 0.2) * 0.5 + 0.5;
        mat.emissiveIntensity = 0.4 + pulse * 0.8;
      } else if (state === 'verified') {
        // Brief green flash handled separately; rest at calm glow
        mat.emissiveIntensity = 0.5 + Math.sin(t * 2 + i * 0.1) * 0.15;
      } else {
        mat.emissiveIntensity = 0.4;
      }
    });
  });

  /* ── shared geometries ── */
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.15, 16, 16), []);
  const glowGeo = useMemo(() => new THREE.SphereGeometry(0.12, 12, 12), []);
  const backboneMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c0d8ee',
        metalness: 0.8,
        roughness: 0.15,
        emissive: '#6699bb',
        emissiveIntensity: 0.2,
      }),
    [],
  );
  const tubeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b0ccee',
        metalness: 0.8,
        roughness: 0.15,
        emissive: '#5588aa',
        emissiveIntensity: 0.25,
      }),
    [],
  );

  return (
    <group ref={groupRef}>
      {/* ── Backbone Tubes ── */}
      <mesh>
        <tubeGeometry args={[curveA, 200, 0.06, 8, false]} />
        <primitive object={tubeMat} attach="material" />
      </mesh>
      <mesh>
        <tubeGeometry args={[curveB, 200, 0.06, 8, false]} />
        <primitive object={tubeMat} attach="material" />
      </mesh>

      {/* ── Base Pairs + Backbone Spheres + Glow ── */}
      {basePairs.map((bp, i) => {
        // Compute orientation: cylinder default axis is Y, we need it along s1→s2
        const direction = new THREE.Vector3().subVectors(bp.s2, bp.s1);
        const midpoint = bp.pos;
        const length = direction.length();
        const orientation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize()
        );

        return (
          <React.Fragment key={i}>
            {/* Base pair cylinder — properly aligned between s1 and s2 */}
            <mesh
              ref={(el) => {
                if (el) basePairRefs.current[i] = el;
              }}
              position={midpoint}
              quaternion={orientation}
            >
              <cylinderGeometry args={[0.12, 0.12, length, 10]} />
              <meshStandardMaterial
                color={bp.color}
                metalness={0.2}
                roughness={0.2}
                emissive={bp.color}
                emissiveIntensity={0.6}
                toneMapped={false}
              />
            </mesh>

            {/* Backbone spheres */}
            <mesh position={bp.s1} geometry={sphereGeo} material={backboneMat} />
            <mesh position={bp.s2} geometry={sphereGeo} material={backboneMat} />

            {/* Glow spheres at connection points */}
            <mesh position={bp.s1} geometry={glowGeo}>
              <meshBasicMaterial color={bp.color} transparent opacity={0.6} />
            </mesh>
            <mesh position={bp.s2} geometry={glowGeo}>
              <meshBasicMaterial color={bp.color} transparent opacity={0.6} />
            </mesh>
          </React.Fragment>
        );
      })}
    </group>
  );
};

export default Helix;
