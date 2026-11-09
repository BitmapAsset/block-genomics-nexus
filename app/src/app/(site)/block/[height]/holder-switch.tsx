'use client';

import { useLayoutEffect, useRef } from 'react';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { isHolderWallet, type HolderOwner } from './holder-view';

/**
 * Shows a card's holder variant once the connected wallet holds the block,
 * else the visitor's (`children`). Both are rendered on the server; this only
 * chooses, and the server never knows the wallet, so the first client render
 * is the visitor's like the HTML. An account switch to another address shows
 * the visitor's again.
 *
 * Focus: when the swap removes the control that had focus (connecting from
 * the guardian card unmounts its button), focus lands on the incoming card's
 * `[data-swap-focus]` element, not on the page body. Focus anywhere else is
 * left alone.
 */

/** The slot that last held focus, across the three switches. */
let lastFocusedSlot: string | null = null;

export default function HolderSwitch({
  slot,
  owner,
  holder,
  children,
}: {
  slot: 'guardian' | 'deed' | 'build';
  owner: HolderOwner;
  holder: React.ReactNode;
  children: React.ReactNode;
}) {
  const isHolder = isHolderWallet(useGlobalWallet(), owner);
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(isHolder);

  useLayoutEffect(() => {
    if (shown.current === isHolder) return;
    shown.current = isHolder;
    const active = document.activeElement;
    if ((active === null || active === document.body) && lastFocusedSlot === slot) {
      ref.current?.querySelector<HTMLElement>('[data-swap-focus]')?.focus({ preventScroll: true });
    }
  }, [isHolder, slot]);

  return (
    <div
      ref={ref}
      data-holder-slot={slot}
      style={{ display: 'contents' }}
      onFocus={() => {
        lastFocusedSlot = slot;
      }}
    >
      {isHolder ? holder : children}
    </div>
  );
}
