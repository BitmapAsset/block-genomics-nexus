'use client';

import dynamic from 'next/dynamic';
import WebGLErrorBoundary from '@/components/WebGLErrorBoundary';

const DNAVisualizer = dynamic(() => import('@/components/DNAVisualizer'), { ssr: false });

interface Props {
  genomeHash: string;
  state?: 'idle' | 'verifying' | 'verified';
  height?: string;
}

export default function DNAHeroClient({ genomeHash, state = 'verified', height = '280px' }: Props) {
  return (
    <WebGLErrorBoundary fallbackMessage="DNA visualization couldn't render. Try a browser with WebGL support.">
      <DNAVisualizer genomeHash={genomeHash} state={state} height={height} />
    </WebGLErrorBoundary>
  );
}
