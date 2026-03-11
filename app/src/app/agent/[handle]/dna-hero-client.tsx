'use client';

import dynamic from 'next/dynamic';

const DNAVisualizer = dynamic(() => import('@/components/DNAVisualizer'), { ssr: false });

interface Props {
  genomeHash: string;
  state?: 'idle' | 'verifying' | 'verified';
  height?: string;
}

export default function DNAHeroClient({ genomeHash, state = 'verified', height = '280px' }: Props) {
  return <DNAVisualizer genomeHash={genomeHash} state={state} height={height} />;
}
