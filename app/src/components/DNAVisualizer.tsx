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
  const currentSpeed = useRef(0.0003);
  const targetSpeed = useRef(0.0003);

  useEffect(() => {
    switch (state) {
      case 'verifying':
        targetSpeed.current = 0.0012;
        break;
      case 'verified':
        targetSpeed.current = 0.0007;
        break;
      default:
        targetSpeed.current = 0.0003;
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
        <fog attach="fog" args={['#0a0a0f', 8, 40]} />
        <PerspectiveCamera makeDefault fov={55} position={[0, 2, 18]} />

        <ambientLight color="#0f1222" intensity={0.7} />
        <pointLight color="#ff9b3b" intensity={2.2} distance={30} position={[6, 2, 6]} />
        <pointLight color="#59c3ff" intensity={1.6} distance={30} position={[-6, 4, -4]} />

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
