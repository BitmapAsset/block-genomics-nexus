'use client';

import React, { useMemo } from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { DNAState } from '../DNAVisualizer';

const Effects: React.FC<{ state: DNAState }> = ({ state }) => {
  const strength = useMemo(() => {
    switch (state) {
      case 'verifying':
        return 2.0;
      case 'verified':
        return 2.5;
      default:
        return 1.2;
    }
  }, [state]);

  return (
    <EffectComposer>
      <Bloom intensity={strength} luminanceThreshold={0.3} luminanceSmoothing={0.7} mipmapBlur />
    </EffectComposer>
  );
};

export default Effects;
