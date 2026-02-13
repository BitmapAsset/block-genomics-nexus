"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";

const NexusMap = dynamic(() => import("@/components/nexus/NexusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full" style={{ background: '#0a0a0f' }}>
      <div className="text-center">
        <div className="text-2xl font-mono font-bold mb-2" style={{ color: '#66ccff' }}>The Nexus</div>
        <div className="text-xs font-mono" style={{ color: '#64748b' }}>Loading block map...</div>
      </div>
    </div>
  ),
});

function NexusContent() {
  const searchParams = useSearchParams();
  const blockParam = searchParams.get('block');
  const initialBlock = blockParam ? parseInt(blockParam, 10) : undefined;

  return (
    <section className="h-[calc(100vh-4rem)] w-full" style={{ background: '#0a0a0f' }}>
      <NexusMap initialBlock={isNaN(initialBlock as number) ? undefined : initialBlock} />
    </section>
  );
}

export default function NexusPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-4rem)] w-full" style={{ background: '#0a0a0f' }} />}>
      <NexusContent />
    </Suspense>
  );
}
