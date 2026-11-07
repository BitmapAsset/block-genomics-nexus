'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * A sheet on the native `<dialog>` with `showModal()`: a centred dialog from
 * 768 px up, a bottom sheet below. The browser gives it the focus trap, the
 * top layer and Escape; a click on the backdrop closes it too, and focus goes
 * back to whatever opened it.
 */
export default function Sheet({
  open,
  onClose,
  title,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const handleClose = () => {
    const back = opener.current;
    opener.current = null;
    onClose();
    if (back instanceof HTMLElement) back.focus();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={handleClose}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is the backdrop.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="bp-sheet fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88vh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-line-2 bg-bg-secondary p-0 text-text-1 shadow-[0_40px_120px_rgba(0,0,0,0.7)] backdrop:bg-[rgba(5,5,8,0.66)] backdrop:backdrop-blur-[6px] md:inset-0 md:m-auto md:max-h-[85vh] md:max-w-[520px] md:rounded-[24px]"
    >
      <div className="p-5 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-[21px] font-[650] leading-[1.25] tracking-[-0.02em] md:text-[24px]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-surface-3 hover:text-text-1"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
