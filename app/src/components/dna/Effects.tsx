'use client';

import React, { useMemo } from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { DNAState } from '../DNAVisualizer';

const Effects: React.FC<{ state: DNAState }> = ({ state }) => {
  const strength = useMemo(() => {
    switch (state) {
      case 'verifying':
        return 1.5;
      case 'verified':
        return 2;
      default:
        return 0.8;
    }
  }, [state]);

  return (
    <EffectComposer>
      <Bloom intensity={strength} luminanceThreshold={0.85} luminanceSmoothing={0.4} />
    </EffectComposer>
  );
};

export default Effects;
