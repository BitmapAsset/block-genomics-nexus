'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const DNAVisualizer = dynamic(() => import('./DNAVisualizer'), {
  ssr: false,
});

interface DNAHeroProps {
  genomeHash: string;
  state?: 'idle' | 'verifying' | 'verified';
  height?: string;
  className?: string;
}

const DNAHero: React.FC<DNAHeroProps> = ({ genomeHash, state = 'verifying', height = '70vh', className }) => {
  return (
    <div className={className}>
      <DNAVisualizer genomeHash={genomeHash} state={state} height={height} />
    </div>
  );
};

export default DNAHero;
