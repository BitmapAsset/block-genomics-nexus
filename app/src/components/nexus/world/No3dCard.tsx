'use client';

import { useEffect, useId, useRef } from 'react';
import { MapPinOff, Map as MapIcon } from 'lucide-react';
import { primaryButton, secondaryButton } from '@/components/ui/button';

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan';

interface Props {
  phone: boolean;
  blockHeight: number;
  onFlatMap: () => void;
}

/** The whole view when this browser cannot run the 3D scene: one way in (the flat map) and one way back. */
export default function No3dCard({ phone, blockHeight, onFlatMap }: Props) {
  const titleId = useId();
  const textId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Focus moves here only from <body> (page load, or the focused HUD control just left with the scene).
  useEffect(() => {
    if (document.activeElement === document.body) primaryRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby={titleId}
      data-testid="world-no3d"
      className="bp-dark mx-4 flex w-full max-w-[360px] flex-col items-center gap-4 rounded-[16px] border border-line-2 bg-bg-secondary p-6 text-center"
    >
      <MapPinOff size={32} aria-hidden="true" className="text-text-3" />
      <h2 id={titleId} className="text-[18px] font-semibold text-text-1">
        {phone ? "This phone can't show the 3D block" : "This browser can't show the 3D block"}
      </h2>
      <p id={textId} className="text-[14px] text-text-2">The flat map shows every parcel of the block from above.</p>
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          ref={primaryRef}
          data-primary
          aria-describedby={textId}
          onClick={onFlatMap}
          className={`${primaryButton} w-full ${ring}`}
        >
          <MapIcon size={18} aria-hidden="true" />
          Open the flat map
        </button>
        <a href={`/block/${blockHeight}`} className={`${secondaryButton} w-full ${ring}`}>
          Back to the block page
        </a>
      </div>
    </section>
  );
}
