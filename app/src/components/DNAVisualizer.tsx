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
  const currentSpeed = useRef(0.0005);
  const targetSpeed = useRef(0.0005);

  useEffect(() => {
    switch (state) {
      case 'verifying':
        targetSpeed.current = 0.002;
        break;
      case 'verified':
        targetSpeed.current = 0.001;
        break;
      default:
        targetSpeed.current = 0.0005;
    }
  }, [state]);

  useFrame((_, delta) => {
    currentSpeed.current += (targetSpeed.current - currentSpeed.current) * 0.08;
    if (groupRef.current) {
      groupRef.current.rotation.y += currentSpeed.current;
      groupRef.current.rotation.x = Math.sin(Date.now() * 0.0005) * 0.1;
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
        <fog attach="fog" args={['#0a0a0f', 0.02]} />
        <PerspectiveCamera makeDefault fov={55} position={[0, 0.6, 9]} />

        <ambientLight color="#0f1222" intensity={0.6} />
        <directionalLight position={[8, 10, 6]} intensity={1.2} color="#8fd3ff" />
        <directionalLight position={[-6, -4, -8]} intensity={0.6} color="#ffb24a" />
        <pointLight color="#6f9dff" intensity={1.6} distance={25} position={[-6, 4, 6]} />
        <pointLight color="#ff8c3a" intensity={1.4} distance={25} position={[6, -4, 4]} />

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
