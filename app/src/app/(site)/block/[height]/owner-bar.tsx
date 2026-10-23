'use client';

import Link from 'next/link';
import { useGlobalWallet } from '@/context/GlobalWalletContext';

/**
 * Tells a connected holder this block is theirs, using the same evidence the
 * deed panel shows: the live holder when the indexer answered, else the record
 * (said as a record). Renders nothing for visitors.
 */
export default function OwnerBar({
  onChainOwner,
  registeredOwner,
}: {
  onChainOwner: string | null;
  registeredOwner: string | null;
}) {
  const { isConnected, walletAddress } = useGlobalWallet();
  if (!isConnected || !walletAddress) return null;

  const holds = onChainOwner === walletAddress;
  const recordedOnly = onChainOwner === null && registeredOwner === walletAddress;
  if (!holds && !recordedOnly) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-bitcoin/25 bg-bitcoin/[0.06] px-4 py-3">
      <p className="text-sm text-text-primary">
        {holds ? 'Your wallet holds this bitmap.' : 'Block Genomics has this bitmap on record for your wallet.'}
      </p>
      <Link
        href="/my-bitmaps"
        className="inline-flex min-h-[44px] items-center rounded-full bg-bitcoin px-4 text-sm font-semibold text-black hover:brightness-110"
      >
        Manage in My Bitmaps
      </Link>
    </div>
  );
}
