"use client";

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

export default function NexusPage() {
  return (
    <section className="h-[calc(100vh-4rem)] w-full" style={{ background: '#0a0a0f' }}>
      <NexusMap />
    </section>
  );
}
