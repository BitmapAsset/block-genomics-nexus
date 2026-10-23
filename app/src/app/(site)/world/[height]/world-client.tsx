'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WebGLErrorBoundary from '@/components/WebGLErrorBoundary';

const ParcelView = dynamic(() => import('@/components/nexus/ParcelView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-text-secondary">
      Loading the world…
    </div>
  ),
});

/**
 * Fullscreen layer above the site header and the mobile tab bar (both z-50),
 * so the 3D view gets every pixel. The page behind it does not scroll.
 */
export default function WorldClient({ blockHeight }: { blockHeight: number }) {
  const router = useRouter();
  const blockHref = `/block/${blockHeight}`;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70]" style={{ background: '#050510' }} data-world-fullscreen>
      <WebGLErrorBoundary
        fallbackMessage="This world couldn't load. Your browser may not support WebGL, or hardware acceleration may be off."
        fallbackHref={blockHref}
        fallbackLinkText="Back to the block page"
      >
        <ParcelView blockHeight={blockHeight} onBack={() => router.push(blockHref)} initialPanelHidden />
      </WebGLErrorBoundary>
      <Link
        href={blockHref}
        className="absolute bottom-4 left-1/2 z-[75] inline-flex -translate-x-1/2 min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 text-sm font-medium text-white backdrop-blur-md hover:bg-black/80"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <span aria-hidden="true">←</span>
        <span className="font-mono">{blockHeight.toLocaleString('en-US')}.bitmap</span>
      </Link>
    </div>
  );
}
