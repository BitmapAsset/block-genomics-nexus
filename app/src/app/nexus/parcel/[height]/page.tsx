'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const ParcelView = dynamic(() => import('@/components/nexus/ParcelView'), { ssr: false });

export default function ParcelPage() {
  const params = useParams();
  const height = parseInt(params.height as string, 10);

  if (isNaN(height)) return <div className="p-8 text-red-500">Invalid block height</div>;

  return (
    <section className="h-[calc(100vh-4rem)] w-full" style={{ background: '#050510' }}>
      <ParcelView blockHeight={height} onBack={() => window.history.back()} />
    </section>
  );
}
