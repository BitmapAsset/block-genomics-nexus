import type { BlockOwnership } from '@/lib/blockPageData';

/**
 * The deed card's badge and explanation, decided in one pure function so the
 * copy for every state can be tested without rendering the page.
 *
 * "Chain unreachable" is its own state on purpose. Before it existed, a chain
 * outage rendered the same "Unverified" badge as a deed nobody could vouch
 * for, which reads as a claim about the property when it is a claim about our
 * upstream. The holder shown in that state is the last recorded one, and the
 * copy says so.
 */

export type DeedTone = 'verified' | 'neutral' | 'outage';

export interface DeedStatus {
  badge: string;
  tone: DeedTone;
  detail: string;
}

/** `2026-10-22 23:36 UTC`: rendered on the server, so one fixed zone for every reader. */
export function formatChainTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function deedStatus(ownership: BlockOwnership): DeedStatus {
  if (ownership.inSync) {
    return {
      badge: 'Verified on-chain',
      tone: 'verified',
      detail: 'Current holder of the .bitmap inscription. Whoever holds the deed controls everything standing on this block.',
    };
  }

  if (!ownership.indeterminate && ownership.onChainOwner !== null) {
    return {
      badge: 'Unverified',
      tone: 'neutral',
      detail: 'Live holder on-chain. This registry still lists a previous owner and has not caught up yet.',
    };
  }

  if (ownership.checkPending) {
    return {
      badge: 'Checking',
      tone: 'neutral',
      detail: 'Last recorded holder. The live chain check is still running; this updates on its own.',
    };
  }

  if (ownership.inscriptionId === null) {
    // No id on file means the chain was never asked, so "unreachable" would
    // be a false reason.
    return {
      badge: 'Unverified',
      tone: 'neutral',
      detail: 'Last recorded holder. Block Genomics has no inscription id on file for this block, so the chain was not checked.',
    };
  }

  const availability = ownership.availability;
  if (availability?.chain === 'unavailable' && availability.unavailableSince) {
    const since = `Chain unreachable since ${formatChainTime(availability.unavailableSince)}`;
    const last = availability.lastVerifiedAt ? `, last verified ${formatChainTime(availability.lastVerifiedAt)}` : '';
    return {
      badge: 'Chain unreachable',
      tone: 'outage',
      detail: `${since}${last}. This is the last recorded holder, not a live answer, and says nothing about a change of hands.`,
    };
  }

  return {
    badge: 'Unverified',
    tone: 'neutral',
    detail: 'Last recorded holder. The chain could not be reached, so this is not confirmed against the chain right now.',
  };
}
