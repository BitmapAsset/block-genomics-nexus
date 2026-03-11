'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import Effects from './dna/Effects';

export type DNAState = 'idle' | 'verifying' | 'verified';

interface DNAVisualizerProps {
  genomeHash: string;
  state?: DNAState;
  className?: string;
  width?: number;
  height?: number | string;
}

// Vibrant color palette mapped to hex chars 0-f
const COLOR_PALETTE: Record<string, string> = {
  '0': '#ff1493', '1': '#ff4500', '2': '#ff6b35', '3': '#ffd700',
  '4': '#7fff00', '5': '#00ff7f', '6': '#00ffff', '7': '#00bfff',
  '8': '#1e90ff', '9': '#8a2be2', 'a': '#9400d3', 'b': '#ff00ff',
  'c': '#ff69b4', 'd': '#ff1744', 'e': '#76ff03', 'f': '#e040fb',
};

const BACKBONE_COLOR = '#4a5568';
const NUM_PAIRS = 32;
const HELIX_TURNS = 3;
const HELIX_RADIUS = 1.2;
const VERTICAL_SPACING = 0.35;
const TOTAL_HEIGHT = NUM_PAIRS * VERTICAL_SPACING;
const SPHERE_RADIUS = 0.12;
const TUBE_RADIUS = 0.06;
const RUNG_RADIUS = 0.08;

function getHashChars(hash: string): string[] {
  const clean = hash.replace(/^0x/, '').toLowerCase();
  const chars: string[] = [];
  for (let i = 0; i < NUM_PAIRS; i++) {
    chars.push(clean[i % clean.length] || '0');
  }
  return chars;
}

// Compute helix positions
function computeHelixPositions() {
  const strandA: THREE.Vector3[] = [];
  const strandB: THREE.Vector3[] = [];
  for (let i = 0; i < NUM_PAIRS; i++) {
    const t = i / (NUM_PAIRS - 1);
    const angle = t * HELIX_TURNS * Math.PI * 2;
    const y = i * VERTICAL_SPACING - TOTAL_HEIGHT / 2;
    strandA.push(new THREE.Vector3(
      Math.cos(angle) * HELIX_RADIUS,
      y,
      Math.sin(angle) * HELIX_RADIUS
    ));
    strandB.push(new THREE.Vector3(
      Math.cos(angle + Math.PI) * HELIX_RADIUS,
      y,
      Math.sin(angle + Math.PI) * HELIX_RADIUS
    ));
  }
  return { strandA, strandB };
}

const Helix: React.FC<{ genomeHash: string; state: DNAState }> = ({ genomeHash, state }) => {
  const groupRef = useRef<THREE.Group>(null);
  const hashChars = useMemo(() => getHashChars(genomeHash), [genomeHash]);
  const { strandA, strandB } = useMemo(() => computeHelixPositions(), []);
  const emissiveIntensity = useRef(0);
  const currentSpeed = useRef(0.003);
  const targetSpeed = useRef(0.003);

  useEffect(() => {
    switch (state) {
      case 'verifying': targetSpeed.current = 0.015; break;
      case 'verified': targetSpeed.current = 0.003; break;
      default: targetSpeed.current = 0.003;
    }
  }, [state]);

  useFrame(({ clock }) => {
    currentSpeed.current += (targetSpeed.current - currentSpeed.current) * 0.05;
    if (groupRef.current) {
      groupRef.current.rotation.y += currentSpeed.current;
    }
    if (state === 'verified') {
      emissiveIntensity.current = 0.15 + Math.sin(clock.getElapsedTime() * 2) * 0.1;
    } else {
      emissiveIntensity.current = 0;
    }
  });

  const backboneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BACKBONE_COLOR,
    metalness: 0.7,
    roughness: 0.3,
  }), []);

  const rungMaterials = useMemo(() => {
    return hashChars.map(c => new THREE.MeshStandardMaterial({
      color: COLOR_PALETTE[c] || '#ffffff',
      metalness: 0.3,
      roughness: 0.4,
      emissive: COLOR_PALETTE[c] || '#ffffff',
      emissiveIntensity: 0.05,
    }));
  }, [hashChars]);

  // Shared geometries
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(SPHERE_RADIUS, 16, 12), []);
  const tubeGeo = useMemo(() => new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, 1, 8), []);
  const rungGeo = useMemo(() => new THREE.CylinderGeometry(RUNG_RADIUS, RUNG_RADIUS, 1, 10), []);

  // Build tube segments between consecutive points on a strand
  const buildTubes = (strand: THREE.Vector3[]) => {
    const tubes: React.ReactNode[] = [];
    for (let i = 0; i < strand.length - 1; i++) {
      const a = strand[i];
      const b = strand[i + 1];
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      tubes.push(
        <mesh key={i} geometry={tubeGeo} material={backboneMat}
          position={[mid.x, mid.y, mid.z]}
          quaternion={quat}
          scale={[1, len, 1]}
        />
      );
    }
    return tubes;
  };

  // Build rungs
  const rungs = useMemo(() => {
    return strandA.map((a, i) => {
      const b = strandB[i];
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return { mid, quat, len, matIndex: i };
    });
  }, [strandA, strandB]);

  return (
    <group ref={groupRef}>
      {/* Backbone spheres - strand A */}
      {strandA.map((p, i) => (
        <mesh key={`sa${i}`} geometry={sphereGeo} material={backboneMat} position={[p.x, p.y, p.z]} />
      ))}
      {/* Backbone spheres - strand B */}
      {strandB.map((p, i) => (
        <mesh key={`sb${i}`} geometry={sphereGeo} material={backboneMat} position={[p.x, p.y, p.z]} />
      ))}
      {/* Backbone tubes - strand A */}
      {buildTubes(strandA)}
      {/* Backbone tubes - strand B */}
      {buildTubes(strandB)}
      {/* Base pair rungs */}
      {rungs.map((r, i) => (
        <mesh key={`r${i}`} geometry={rungGeo} material={rungMaterials[i]}
          position={[r.mid.x, r.mid.y, r.mid.z]}
          quaternion={r.quat}
          scale={[1, r.len, 1]}
        />
      ))}
    </group>
  );
};

const Particles: React.FC<{ state: DNAState }> = ({ state }) => {
  const count = 200;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      arr.push([
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
      ]);
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    positions.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      const s = 0.02 + Math.random() * 0.03;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, dummy]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
    </instancedMesh>
  );
};

const Scene: React.FC<{ genomeHash: string; state: DNAState }> = ({ genomeHash, state }) => {
  return (
    <>
      <Helix genomeHash={genomeHash} state={state} />
      <Particles state={state} />
    </>
  );
};

const DNAVisualizer: React.FC<DNAVisualizerProps> = ({
  genomeHash,
  state = 'idle',
  className,
  width,
  height = '70vh',
}) => {
  const style: React.CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
    width: width ? `${width}px` : '100%',
  };

  return (
    <div className={className} style={style}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#000000']} />
        <PerspectiveCamera makeDefault fov={60} position={[0, 0, 8]} />

        <ambientLight intensity={0.3} />
        <directionalLight
          color="#ffffff"
          intensity={1.2}
          position={[5, 8, 5]}
          castShadow
        />
        <pointLight
          color="#fff5ee"
          intensity={0.8}
          position={[-5, 2, 4]}
        />
        <pointLight
          color="#4466ff"
          intensity={0.4}
          position={[0, -3, -6]}
        />

        <Scene genomeHash={genomeHash} state={state} />
        <Effects state={state} />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          enablePan={false}
          autoRotate={false}
          minDistance={4}
          maxDistance={20}
        />
      </Canvas>
    </div>
  );
};

export default DNAVisualizer;
