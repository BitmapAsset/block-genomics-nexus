import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for modal behavior: ESC to close + focus trap within the modal.
 * Attach the returned ref to the modal's container div.
 */
export function useModalClose(onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);

  // ESC key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Focus trap: keep Tab cycling within the modal
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    // Focus the modal itself or first focusable element
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = modal.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const currentFocusables = modal.querySelectorAll<HTMLElement>(focusableSelector);
      if (currentFocusables.length === 0) return;

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  // Click-outside handler (for the backdrop)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return { modalRef, handleBackdropClick };
}
