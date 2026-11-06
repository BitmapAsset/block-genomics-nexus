'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Share } from 'lucide-react';
import CopyButton from './copy-button';
import Menu, { MenuGroup, menuRow } from '@/components/ui/menu';

/** The site's canonical origin (`metadataBase` in app/layout.tsx), so a shared link never points at a preview. */
export const CANONICAL_ORIGIN = 'https://blockgenomics.io';

export function canonicalBlockUrl(height: number): string {
  return `${CANONICAL_ORIGIN}/block/${height}`;
}

export const shareButton =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-line-2 bg-surface-3 px-5 text-[15px] font-medium text-text-1 transition-colors duration-150 hover:bg-white/[0.12] motion-reduce:transition-none';

/**
 * The page's one Share. On a touch phone with the system share sheet it hands
 * the canonical URL to that sheet (a cancel does nothing); otherwise it opens a
 * small menu: Copy link, Post on X, and a QR code of the same URL.
 */
export default function ShareMenu({
  height,
  placement = 'down',
  className = '',
}: {
  height: number;
  /** Where the menu opens: below the button, or above it (the phone dock). */
  placement?: 'down' | 'up';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const url = canonicalBlockUrl(height);
  const title = `Block ${height} on Block Genomics`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const onShare = () => {
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    setOpen((o) => !o);
  };

  const x = `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={onShare} className={shareButton} aria-expanded={open} aria-haspopup="true">
        <Share size={18} strokeWidth={1.75} aria-hidden="true" />
        Share
      </button>
      {open && (
        <Menu
          label="Share this block"
          testId="share-menu"
          className={`absolute z-40 ${placement === 'up' ? 'bottom-full right-0 mb-2' : 'left-0 top-full mt-2'}`}
        >
          <MenuGroup>
            <CopyButton text={url} label="link" className={menuRow} />
            <a href={x} target="_blank" rel="noopener noreferrer" className={menuRow}>
              <span className="inline-flex h-[18px] w-[18px] items-center justify-center text-[13px] font-bold" aria-hidden="true">
                X
              </span>
              Post on X
            </a>
          </MenuGroup>
          <MenuGroup caption="QR code">
            <div className="flex items-start gap-3 px-3 pb-2">
              <div className="shrink-0 rounded-[10px] bg-white p-2">
                <QRCodeSVG value={url} size={104} aria-label={`QR code for ${url}`} />
              </div>
              <p className="flex gap-1.5 text-[13px] leading-[1.45] text-text-2">
                <QrCode size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Point a phone camera here to open {height}. The link card shows the block&apos;s artwork.
                </span>
              </p>
            </div>
          </MenuGroup>
        </Menu>
      )}
    </div>
  );
}
