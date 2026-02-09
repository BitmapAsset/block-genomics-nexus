'use client';

import React, { useEffect, useMemo, useRef } from 'react';
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
  a: '#3366ff',
  b: '#6633ff',
  c: '#9933ff',
  d: '#cc33ff',
  e: '#ff33cc',
  f: '#ff3399',
};

interface HelixProps {
  genomeHash: string;
  state: DNAState;
}

const cubeSize = 2.5;

const Helix: React.FC<HelixProps> = ({ genomeHash, state }) => {
  const cubeRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const streamRefs = useRef<THREE.Mesh[]>([]);

  const hash = genomeHash.toLowerCase();

  const gridGeometry = useMemo(() => {
    const divisions = 6;
    const half = cubeSize / 2;
    const positions: number[] = [];

    const addLine = (a: THREE.Vector3, b: THREE.Vector3) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };

    const addFaceGrid = (normal: 'x' | 'y' | 'z', sign: 1 | -1) => {
      for (let i = 0; i <= divisions; i += 1) {
        const t = (i / divisions - 0.5) * cubeSize;
        if (normal === 'x') {
          addLine(new THREE.Vector3(sign * half, t, -half), new THREE.Vector3(sign * half, t, half));
          addLine(new THREE.Vector3(sign * half, -half, t), new THREE.Vector3(sign * half, half, t));
        }
        if (normal === 'y') {
          addLine(new THREE.Vector3(-half, sign * half, t), new THREE.Vector3(half, sign * half, t));
          addLine(new THREE.Vector3(t, sign * half, -half), new THREE.Vector3(t, sign * half, half));
        }
        if (normal === 'z') {
          addLine(new THREE.Vector3(-half, t, sign * half), new THREE.Vector3(half, t, sign * half));
          addLine(new THREE.Vector3(t, -half, sign * half), new THREE.Vector3(t, half, sign * half));
        }
      }
    };

    addFaceGrid('x', 1);
    addFaceGrid('x', -1);
    addFaceGrid('y', 1);
    addFaceGrid('y', -1);
    addFaceGrid('z', 1);
    addFaceGrid('z', -1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  const bitcoinTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.35)';
    ctx.lineWidth = 6;
    ctx.font = 'bold 180px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('₿', 128, 140);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const streams = useMemo(() => {
    const streamCount = 16;
    const half = cubeSize / 2;
    const corners = [
      new THREE.Vector3(-half, -half, -half),
      new THREE.Vector3(half, -half, -half),
      new THREE.Vector3(-half, half, -half),
      new THREE.Vector3(half, half, -half),
      new THREE.Vector3(-half, -half, half),
      new THREE.Vector3(half, -half, half),
      new THREE.Vector3(-half, half, half),
      new THREE.Vector3(half, half, half),
    ];

    const getRand = (i: number) => {
      const hex = hash[i % hash.length] || '0';
      return parseInt(hex, 16) / 15;
    };

    return Array.from({ length: streamCount }).map((_, i) => {
      const corner = corners[i % corners.length].clone();
      const dir = corner.clone().normalize();
      const jitter = new THREE.Vector3(
        (getRand(i + 3) - 0.5) * 0.6,
        (getRand(i + 7) - 0.5) * 0.6,
        (getRand(i + 11) - 0.5) * 0.6
      );
      const end = corner.clone().add(dir.multiplyScalar(3.5 + getRand(i + 5) * 2)).add(jitter);
      const mid1 = corner.clone().add(dir.clone().multiplyScalar(1.3)).add(jitter.clone().multiplyScalar(0.5));
      const mid2 = corner.clone().add(dir.clone().multiplyScalar(2.4)).add(jitter.clone().multiplyScalar(0.8));
      const curve = new THREE.CatmullRomCurve3([corner, mid1, mid2, end]);
      const hexChar = hash[i % hash.length] || '0';
      const color = new THREE.Color(colorPalette[hexChar] || '#ffffff');
      return { curve, color, phase: getRand(i + 13) * Math.PI * 2 };
    });
  }, [hash]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (coreRef.current) {
      const basePulse = 1 + Math.sin(time * 2) * 0.08;
      const boost = state === 'verifying' ? 0.12 : state === 'verified' ? 0.06 : 0.04;
      coreRef.current.scale.setScalar(basePulse + boost);
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2.2 + Math.sin(time * 3) * 0.6 + (state === 'verifying' ? 0.8 : 0.2);
    }

    streamRefs.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.55 + Math.sin(time * 2 + streams[i].phase) * 0.25;
      mat.emissiveIntensity = 1.6 + Math.sin(time * 3 + streams[i].phase) * 0.6;
    });

    if (cubeRef.current) {
      const mat = cubeRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(time * 1.2) * 0.2;
    }
  });

  useEffect(() => {
    streamRefs.current = streamRefs.current.slice(0, streams.length);
  }, [streams.length]);

  return (
    <group>
      <mesh ref={cubeRef}>
        <boxGeometry args={[cubeSize, cubeSize, cubeSize]} />
        <meshStandardMaterial
          color="#0b1020"
          metalness={0.6}
          roughness={0.25}
          emissive="#1b2a4a"
          emissiveIntensity={0.8}
          transparent
          opacity={0.72}
        />
      </mesh>

      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial color="#3a4a6a" transparent opacity={0.35} />
      </lineSegments>

      <mesh position={[0, 0, cubeSize / 2 + 0.01]}>
        <planeGeometry args={[cubeSize * 0.8, cubeSize * 0.8]} />
        <meshBasicMaterial
          map={bitcoinTexture || undefined}
          transparent
          opacity={0.22}
          color="#ffcc66"
        />
      </mesh>

      <mesh ref={coreRef}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color="#52ffe8"
          emissive="#6fffe6"
          emissiveIntensity={2.4}
          metalness={0.2}
          roughness={0.2}
          transparent
          opacity={0.85}
        />
      </mesh>

      {streams.map((stream, i) => (
        <mesh
          key={`stream-${i}`}
          ref={(el) => {
            if (el) streamRefs.current[i] = el;
          }}
        >
          <tubeGeometry args={[stream.curve, 40, 0.05, 8, false]} />
          <meshStandardMaterial
            color={stream.color}
            emissive={stream.color}
            emissiveIntensity={1.4}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
};

export default Helix;
