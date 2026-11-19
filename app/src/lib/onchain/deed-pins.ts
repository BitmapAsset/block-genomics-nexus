/**
 * The pinned deed for a height, when the repository recorded one.
 *
 * Applies only under the rule id the pins were recorded with: a resolver rule
 * change (or a suite that mocks the resolver under another rule id) switches
 * every pin off, and the deed then comes from lib/onchain/deed.ts's resolver.
 */

import { RULE_ID } from '@/vendor/bitmap-resolver';
import { DEED_PINS, DEED_PINS_RULE_ID } from '@/lib/onchain/deed-pins.data';

export function pinnedDeed(height: number): { inscriptionId: string } | null {
  if (DEED_PINS_RULE_ID !== RULE_ID) return null;
  if (!Object.prototype.hasOwnProperty.call(DEED_PINS, height)) return null;
  const inscriptionId = DEED_PINS[height];
  return typeof inscriptionId === 'string' ? { inscriptionId } : null;
}
