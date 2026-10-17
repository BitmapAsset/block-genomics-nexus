'use client';

import Link from 'next/link';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { useBlockHeight } from '@/hooks/useBlockHeight';
import { openWalletModal } from '@/lib/open-wallet-modal';

/**
 * The one call to action. A visitor connects (and lands on My Bitmaps once the
 * wallet answers); a connected owner goes straight there.
 */
export function HomeCta() {
  const { isConnected, isConnecting } = useGlobalWallet();

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      {isConnected ? (
        <Link
          href="/my-bitmaps"
          className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-bitcoin px-8 text-base font-semibold text-black transition hover:brightness-110"
        >
          Open My Bitmaps
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => openWalletModal('/my-bitmaps')}
          disabled={isConnecting}
          className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-bitcoin px-8 text-base font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          data-testid="home-connect"
        >
          {isConnecting ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
      <Link
        href="/explore"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-text-primary underline-offset-4 hover:underline"
      >
        Look around first →
      </Link>
    </div>
  );
}

/**
 * Live chain height for the first fact. With no answer it says "Every Bitcoin
 * block" rather than a stale constant (the old fallback read 880K+ at ~970K).
 */
export function BlockCountFact() {
  const height = useBlockHeight();
  return <>{height ? `${(height + 1).toLocaleString('en-US')} blocks` : 'Every Bitcoin block'}</>;
}
