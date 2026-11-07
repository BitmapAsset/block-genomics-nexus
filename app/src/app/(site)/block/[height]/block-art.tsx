'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';

/**
 * The block's artwork, the hero of its page: the stored 576 px PNG drawn
 * pixel for pixel (`image-rendering: pixelated`) in a fixed square box, so
 * nothing shifts while it loads. If it fails, the box says so and offers Try
 * again, which asks for the same picture once more; the rest of the hero is
 * unaffected. An error that fired before hydration is caught on mount.
 */
export default function BlockArt({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  /** Drawn over the art's bottom-left corner (the scale chip). */
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const i = img.current;
    if (i && i.complete && i.naturalWidth === 0 && i.getAttribute('src')) setFailed(true);
  }, [attempt]);

  return (
    <div className="relative aspect-square w-full overflow-hidden bg-[#1d1c2e] md:rounded-[28px] md:shadow-[0_40px_90px_rgba(0,0,0,0.55)] md:ring-1 md:ring-inset md:ring-line-1">
      {failed ? (
        <div
          className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-line-3 text-center"
          data-testid="block-art-failed"
        >
          <ImageOff size={22} strokeWidth={1.75} className="text-text-2" aria-hidden="true" />
          <p className="text-[14.5px] text-text-2">The artwork didn&apos;t load.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line-2 bg-surface-3 px-4 text-[14px] text-text-1 hover:bg-white/[0.12]"
          >
            <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the stored PNG from the thumbnail API, already cached per height
        <img
          key={attempt}
          ref={img}
          src={src}
          alt={alt}
          width={576}
          height={576}
          fetchPriority="high"
          onError={() => setFailed(true)}
          className="block h-full w-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      {children && !failed && <div className="pointer-events-none absolute bottom-3 left-3">{children}</div>}
    </div>
  );
}
