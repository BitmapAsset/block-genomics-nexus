'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DNAState } from '../DNAVisualizer';

const palette = [
  '#ff0055', '#ff3366', '#ff6633', '#ffaa00', '#ccff00', '#66ff33',
  '#00ff99', '#00ffcc', '#00ccff', '#0099ff', '#3366ff', '#6633ff',
  '#9933ff', '#cc33ff', '#ff33cc', '#ff3399',
];

interface ParticlesProps {
  state: DNAState;
  particleCount?: number;
}

const Particles: React.FC<ParticlesProps> = ({ state, particleCount = 200 }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const burstRef = useRef<THREE.Points>(null);
  const [burstActive, setBurstActive] = useState(false);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 15;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [particleCount]);

  const burst = useMemo(() => {
    const count = 120;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;

      vel[i * 3] = (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 1] = Math.random() * 0.3 + 0.1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    return { count, pos, vel };
  }, []);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.0005;
      const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(clock.elapsedTime + i) * 0.002;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    if (burstRef.current && burstActive) {
      const arr = burstRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < burst.count; i += 1) {
        arr[i * 3] += burst.vel[i * 3];
        arr[i * 3 + 1] += burst.vel[i * 3 + 1];
        arr[i * 3 + 2] += burst.vel[i * 3 + 2];
        burst.vel[i * 3 + 1] -= 0.005;
      }
      burstRef.current.geometry.attributes.position.needsUpdate = true;
      const mat = burstRef.current.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, mat.opacity - 0.01);
      if (mat.opacity <= 0.02) {
        setBurstActive(false);
        mat.opacity = 0;
      }
    }
  });

  React.useEffect(() => {
    if (state === 'verified') {
      if (burstRef.current) {
        burstRef.current.geometry.attributes.position.array.set(burst.pos);
        burstRef.current.geometry.attributes.position.needsUpdate = true;
        (burstRef.current.material as THREE.PointsMaterial).opacity = 1;
      }
      setBurstActive(true);
    }
  }, [state, burst.pos]);

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          vertexColors
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      <points ref={burstRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[burst.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.15}
          color="#00ff66"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
};

export default Particles;
