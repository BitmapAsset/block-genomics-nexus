'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Mail, MessageCircle, Wallet } from 'lucide-react';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { openWalletModal } from '@/lib/open-wallet-modal';
import type { GuardianChatMode } from '@/lib/guardian-chat';

/**
 * The guardian card's buttons. The chat sheet, its dialog and the chat helper
 * load when someone first opens it, not with the page, so a visitor who only
 * reads the page never downloads or runs them.
 */
const GuardianSheet = dynamic(() => import('./guardian-sheet').then((m) => m.GuardianSheet), { ssr: false });

export const actionButton =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-line-2 bg-surface-3 px-5 text-[15px] font-medium text-text-1 transition-colors duration-150 hover:bg-white/[0.12] motion-reduce:transition-none';

/**
 * The card's action: "Talk to <name>" or "Leave a message for <name>". The
 * server HTML carries only the button.
 */
export function GuardianAction({ height, name, mode }: { height: number; name: string; mode: GuardianChatMode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button
        type="button"
        data-action={mode}
        className={actionButton}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {mode === 'talk' ? (
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Mail size={18} strokeWidth={1.75} aria-hidden="true" />
        )}
        {mode === 'talk' ? `Talk to ${name}` : `Leave a message for ${name}`}
      </button>
      {mounted && <GuardianSheet height={height} name={name} mode={mode} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The no-guardian card's one prompt: connect a wallet, then set the guardian
 * up from the world. Same height either way, so connecting shifts nothing.
 */
export function GuardianHoldPrompt({ height }: { height: number }) {
  const { isConnected } = useGlobalWallet();
  const cls = 'inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-medium text-accent-cyan hover:underline';
  if (isConnected) {
    return (
      <Link href={`/world/${height}`} className={cls} data-testid="guardian-setup">
        Set it up from the world
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => openWalletModal()} className={cls} data-testid="guardian-connect">
      <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
      Hold this block? Connect your wallet
    </button>
  );
}
