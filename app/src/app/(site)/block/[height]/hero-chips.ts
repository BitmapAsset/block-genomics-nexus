/**
 * The hero's chips and facts as plain strings, so every state's wording is
 * tested without rendering the page. Pure: no fetch, no clock of its own.
 *
 * Green only from data that proves it (the deed rule's canonical deed, its
 * holder answered and equals the record); amber for "can't check right now";
 * no red. Non-breaking spaces keep each count with its noun.
 */

import { BLOCK_EDGE_M } from '@/lib/world-scale';
import { formatBytes, formatNumber } from '@/lib/genome-utils';
import type { BlockOwnership, BlockPageData } from '@/lib/blockPageData';
import type { ChipTone } from '@/components/ui/chip';
import { ageOf, type DeedStatus } from './deed-status';

const NB = ' ';

/** "2.1 km × 2.1 km", from the world's block edge. */
export function groundText(): string {
  const km = `${(BLOCK_EDGE_M / 1000).toFixed(1)}${NB}km`;
  return `${km} × ${km}`;
}

/** "N parcels": one parcel per transaction in the block's layout. */
export function parcelsText(txCount: number): string {
  return `${formatNumber(txCount)}${NB}${txCount === 1 ? 'parcel' : 'parcels'}`;
}

/** The scale chip on the art: "2.1 km × 2.1 km · 1,114 parcels". */
export function scaleChipText(txCount: number): string {
  return `${groundText()} · ${parcelsText(txCount)}`;
}

export function minedDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The identity line: mined date, transactions, then size, or what has been built when something has. */
export function identityFacts(chain: BlockPageData['chain'], objectCount: number): string[] {
  if (!chain) return [];
  const built =
    objectCount > 0 ? `${formatNumber(objectCount)}${NB}${objectCount === 1 ? 'thing' : 'things'} built` : formatBytes(chain.size);
  return [
    `Mined ${minedDate(chain.timestamp)}`,
    `${formatNumber(chain.txCount)}${NB}${chain.txCount === 1 ? 'transaction' : 'transactions'}`,
    built,
  ];
}

export interface DeedChipView {
  text: string;
  tone: ChipTone;
  /** The deed state key, or the unclaimed / degraded state. */
  state: string;
  /** A sentence under the chip, for states the chip alone would undersell. */
  line?: string;
}

/**
 * The hero's deed chip, from `deedStatus` (unchanged) by its key. `status` is
 * null for a block that is not on record (no deed lookup runs for it).
 */
export function deedChipView(
  ownership: BlockOwnership,
  status: DeedStatus | null,
  degraded: boolean,
  now: number,
): DeedChipView {
  if (!status) {
    return degraded
      ? { text: 'Ownership unavailable', tone: 'neutral', state: 'degraded' }
      : { text: 'Not on Block Genomics', tone: 'neutral', state: 'not-on-block-genomics' };
  }
  switch (status.key) {
    case 'verified': {
      const checked = ownership.deed?.checkedAt ?? null;
      return {
        text: `Deed verified on Bitcoin${checked ? ` · ${ageOf(checked, now)}` : ''}`,
        tone: ownership.inSync === true ? 'ok' : 'neutral',
        state: status.key,
      };
    }
    case 'unreachable': {
      const last = ownership.availability?.lastVerifiedAt ?? null;
      return {
        text: `Deed not checked${last ? ` · last verified ${ageOf(last, now)}` : ''}`,
        tone: 'warn',
        state: status.key,
      };
    }
    case 'disputed':
      return { text: status.badge, tone: 'warn', state: status.key };
    case 'no-deed-found':
      return {
        text: 'No valid deed found',
        tone: 'neutral',
        state: status.key,
        line: 'Bitcoin shows no valid deed inscription for this block yet.',
      };
    default:
      return { text: status.badge, tone: 'neutral', state: status.key };
  }
}

export interface GuardianChipView {
  text: string;
  tone: ChipTone;
  state: string;
}

/** "Guardian <name> · <state>", or "No guardian yet". Null when the guardian lookup failed. */
export function guardianChipView(
  guardian: { name: string; label: string; tone: ChipTone; key: string } | null,
  degraded: boolean,
): GuardianChipView | null {
  if (degraded) return null;
  if (!guardian) return { text: 'No guardian yet', tone: 'neutral', state: 'none' };
  return { text: `Guardian ${guardian.name} · ${guardian.label}`, tone: guardian.tone, state: guardian.key };
}
