import type { BlockOwnership } from '@/lib/blockPageData';
import type { DeedStatus } from './deed-status';

/**
 * The holder layer of the block page (bg98a2), decided in pure functions.
 *
 * HolderSwitch runs this in the browser, so it imports types only:
 * lib/blockPageData (and deed-status, which reads it) cannot load there. The
 * three rules it needs are said here in their own words, each matching the
 * original, and the test checks them against `displayOwner`, `deedStatus` and
 * `verifiedOnDeedRule`.
 */

/** The two ownership fields the holder rule reads; the page passes only these to the client. */
export type HolderOwner = Pick<BlockOwnership, 'onChainOwner' | 'registeredOwner'>;

/**
 * A wallet holds the block when its address is the holder the Deed card names:
 * the live holder when Bitcoin answered, else the record (`displayOwner`).
 * That is bg95's OwnerBar rule. Exact string equality; an empty address is
 * never a holder.
 */
export function isHolderWallet(wallet: { isConnected: boolean; walletAddress: string | null }, owner: HolderOwner): boolean {
  return (
    wallet.isConnected &&
    typeof wallet.walletAddress === 'string' &&
    wallet.walletAddress !== '' &&
    wallet.walletAddress === (owner.onChainOwner ?? owner.registeredOwner)
  );
}

/** deed-status's `ageOf`: "just now", "N min ago", "N h ago", "N days ago". */
function ageOf(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

const RECORD_LINE = 'On record for your wallet · not checked';

/**
 * The status line "Your deed" shows a holder, or null to keep the visitor's
 * text. "You hold this deed" only on the deed rule (`verifiedOnDeedRule`: the
 * record matches the canonical deed's holder); a holder the page could not
 * check on Bitcoin reads as a record. No tone of its own: the card's chip keeps
 * the visitor rule.
 */
export function holderDeedLine(ownership: BlockOwnership, status: DeedStatus, now: number): string | null {
  switch (status.key) {
    case 'verified': {
      if (!(ownership.inSync && ownership.deed?.verdict === 'canonical')) return null;
      const at = ownership.deed?.checkedAt ?? null;
      return `You hold this deed${at ? ` · checked ${ageOf(at, now)}` : ''}`;
    }
    case 'registry-behind':
    case 'disputed':
    case 'no-deed-found':
      return null;
    case 'unreachable':
    case 'checking':
    case 'no-deed-on-file':
      return RECORD_LINE;
  }
}
