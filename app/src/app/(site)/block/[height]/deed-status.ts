import { verifiedOnDeedRule, type BlockOwnership } from '@/lib/blockPageData';

/**
 * The deed chip's text and explanation, decided in one pure function so the
 * copy for every state can be tested without rendering the page.
 *
 * The chip follows the deed rule, like the ownership API: it turns green only
 * when the rule named the canonical deed, its holder answered, and that holder
 * equals the record. While Bitcoin cannot be checked it says so, with the time
 * this server first saw it, and the holder shown is the last recorded one.
 * "Checking" is only ever said while a check is really running; the re-check
 * on the client gives it an end.
 */

export type DeedTone = 'verified' | 'neutral' | 'outage';

/** Which of the deed states the chip is in (PLAN-bg95 §7). */
export type DeedStateKey =
  | 'verified'
  | 'registry-behind'
  | 'disputed'
  | 'checking'
  | 'no-deed-found'
  | 'no-deed-on-file'
  | 'unreachable';

export interface DeedStatus {
  key: DeedStateKey;
  badge: string;
  tone: DeedTone;
  detail: string;
}

/** `2026-10-22 23:36 UTC`: rendered on the server, so one fixed zone for every reader. */
export function formatChainTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** `23:36 UTC`, the short form the chip uses. */
export function formatChainClock(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

/** "just now", "N min ago", "N h ago", "N days ago". */
export function ageOf(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function deedStatus(ownership: BlockOwnership, now: number = Date.now()): DeedStatus {
  const deed = ownership.deed;

  if (verifiedOnDeedRule(ownership)) {
    const checked = deed?.checkedAt ? ` · ${ageOf(deed.checkedAt, now)}` : '';
    return {
      key: 'verified',
      badge: `Verified on Bitcoin${checked}`,
      tone: 'verified',
      detail: 'Current holder of the deed inscription. Whoever holds the deed controls everything standing on this block.',
    };
  }

  if (deed?.verdict === 'canonical' && ownership.onChainOwner !== null) {
    return {
      key: 'registry-behind',
      badge: 'Holder on Bitcoin · record catching up',
      tone: 'neutral',
      detail: 'This is the holder Bitcoin reports for the deed. Block Genomics still lists an earlier holder and has not caught up yet.',
    };
  }

  if (deed?.verdict === 'disputed') {
    return {
      key: 'disputed',
      badge: 'Deed disputed · under review',
      tone: 'outage',
      detail: 'Bitcoin sources do not agree on which inscription is the deed, so a person reviews it. This is the last recorded holder.',
    };
  }

  if (ownership.checkPending) {
    return {
      key: 'checking',
      badge: 'Checking…',
      tone: 'neutral',
      detail: deed?.queued
        ? 'Last recorded holder. Other blocks are being checked against Bitcoin first; this one follows.'
        : 'Last recorded holder. A check against Bitcoin is running.',
    };
  }

  if (deed?.verdict === 'none') {
    return {
      key: 'no-deed-found',
      badge: 'No deed found on Bitcoin',
      tone: 'neutral',
      detail: 'Last recorded holder. Bitcoin shows no deed inscription for this block yet, so there is no holder to compare.',
    };
  }

  if (ownership.inscriptionId === null && deed?.verdict !== 'canonical') {
    // No id on file and no answer from the deed rule: the chain was never
    // asked about a holder, so "unreachable" would be a false reason.
    return {
      key: 'no-deed-on-file',
      badge: 'Not checked · no deed on file',
      tone: 'neutral',
      detail: 'Last recorded holder. Block Genomics has no deed inscription on file for this block, so Bitcoin was not checked.',
    };
  }

  const since = deed?.unreachableSince ?? ownership.availability?.unavailableSince ?? null;
  const last = ownership.availability?.lastVerifiedAt
    ? ` Last verified ${formatChainTime(ownership.availability.lastVerifiedAt)}.`
    : '';
  return {
    key: 'unreachable',
    badge: since
      ? `Not checked · Bitcoin indexer unreachable since ${formatChainClock(since)}`
      : 'Not checked · Bitcoin indexer unreachable',
    tone: 'outage',
    detail: `Last recorded holder. Bitcoin could not be checked${since ? ` since ${formatChainTime(since)}` : ' right now'}, so this is not confirmed and says nothing about a change of hands.${last}`,
  };
}
