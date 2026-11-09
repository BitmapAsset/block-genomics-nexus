import { displayOwner, verifiedOnDeedRule, type BlockOwnership } from '@/lib/blockPageData';
import { ageOf, type DeedStatus } from './deed-status';

/**
 * The holder layer of the block page (bg98a2), decided in pure functions.
 *
 * A wallet holds the block when its address is the holder the Deed card names:
 * the live holder when Bitcoin answered, else the record (said as a record on
 * the card). That is bg95's OwnerBar rule, written once. Exact string equality,
 * and an empty address is never a holder.
 */

/** The two ownership fields the rule reads; the page passes only these to the client. */
export type HolderOwner = Pick<BlockOwnership, 'onChainOwner' | 'registeredOwner'>;

export function isHolderWallet(
  wallet: { isConnected: boolean; walletAddress: string | null },
  owner: HolderOwner,
): boolean {
  return (
    wallet.isConnected &&
    typeof wallet.walletAddress === 'string' &&
    wallet.walletAddress !== '' &&
    // displayOwner reads only these two fields.
    wallet.walletAddress === displayOwner(owner as BlockOwnership)
  );
}

const RECORD_LINE = 'On record for your wallet · not checked';

/**
 * The status line "Your deed" shows a holder, or null to keep the visitor's
 * text. "You hold this deed" only on the deed rule; a holder the page could not
 * check on Bitcoin reads as a record. No tone of its own: the card's chip keeps
 * the visitor rule.
 */
export function holderDeedLine(ownership: BlockOwnership, status: DeedStatus, now: number): string | null {
  switch (status.key) {
    case 'verified': {
      if (!verifiedOnDeedRule(ownership)) return null;
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
