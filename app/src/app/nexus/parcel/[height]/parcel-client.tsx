'use client';

import dynamic from 'next/dynamic';

const ParcelView = dynamic(() => import('@/components/nexus/ParcelView'), { ssr: false });

export default function ParcelClient({ blockHeight }: { blockHeight: number }) {
  return (
    <section className="h-[calc(100vh-4rem)] w-full" style={{ background: '#050510' }}>
      <ParcelView blockHeight={blockHeight} onBack={() => window.history.back()} />
    </section>
  );
}
