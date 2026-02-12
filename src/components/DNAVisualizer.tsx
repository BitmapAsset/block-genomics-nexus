'use client';

import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import Helix from './dna/Helix';
import Particles from './dna/Particles';
import Effects from './dna/Effects';

export type DNAState = 'idle' | 'verifying' | 'verified';

interface DNAVisualizerProps {
  genomeHash: string;
  state?: DNAState;
  className?: string;
  height?: string;
}

const Scene: React.FC<{ genomeHash: string; state: DNAState }> = ({ genomeHash, state }) => {
  const groupRef = useRef<THREE.Group>(null);
  const currentSpeed = useRef(0.003);
  const targetSpeed = useRef(0.003);

  useEffect(() => {
    switch (state) {
      case 'verifying':
        targetSpeed.current = 0.015;
        break;
      case 'verified':
        targetSpeed.current = 0.0015;
        break;
      default:
        targetSpeed.current = 0.003;
    }
  }, [state]);

  useFrame(() => {
    currentSpeed.current += (targetSpeed.current - currentSpeed.current) * 0.05;
    if (groupRef.current) {
      groupRef.current.rotation.y += currentSpeed.current;
    }
  });

  return (
    <group ref={groupRef}>
      <Helix genomeHash={genomeHash} state={state} />
      <Particles state={state} />
    </group>
  );
};

const DNAVisualizer: React.FC<DNAVisualizerProps> = ({
  genomeHash,
  state = 'idle',
  className,
  height = '70vh',
}) => {
  return (
    <div className={className} style={{ height, width: '100%' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 25, 50]} />
        <PerspectiveCamera makeDefault fov={60} position={[0, 0, 15]} />

        {/* Ambient */}
        <ambientLight color="#222244" intensity={0.5} />

        {/* Main directional */}
        <directionalLight color="#ffffff" intensity={1} position={[10, 10, 10]} />

        {/* Accent point lights (orbiting handled inside Scene via clock) */}
        <pointLight color="#0066ff" intensity={2} distance={30} position={[-10, 5, 5]} />
        <pointLight color="#ff0066" intensity={2} distance={30} position={[10, -5, 5]} />

        <Scene genomeHash={genomeHash} state={state} />
        <Effects state={state} />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          enablePan={false}
          minDistance={8}
          maxDistance={30}
        />
      </Canvas>
    </div>
  );
};

export default DNAVisualizer;
