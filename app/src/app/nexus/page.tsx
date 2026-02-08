"use client";

import dynamic from "next/dynamic";

const NexusMap = dynamic(() => import("@/components/NexusMap"), {
  ssr: false,
});

export default function NexusPage() {
  return (
    <section className="h-[calc(100vh-4rem)] w-full bg-[#0a0a0f]">
      <NexusMap />
    </section>
  );
}
