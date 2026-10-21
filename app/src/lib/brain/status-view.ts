/**
 * One status source for every Brain indicator on /brain.
 *
 * The runtime block of /api/v1/brain/status is the only truth. ONLINE only
 * when the runtime reports online AND the soul was verified from the Bitcoin
 * inscription; anything else gets the same honest label everywhere on the
 * page, plus a one-line reason a visitor can read.
 */

export interface BrainRuntime {
  status: string;
  soulVerified: boolean;
}

export type BrainStatusState = 'connecting' | 'online' | 'degraded' | 'not_booted' | 'unknown';

export interface BrainStatusView {
  state: BrainStatusState;
  /** Short uppercase label for the hero badge and the chat header. */
  label: string;
  /** Label for the identity card. */
  cardLabel: string;
  /** One line explaining a non-online state; empty when online or loading. */
  reason: string;
}

export function brainStatusView(runtime: BrainRuntime | undefined | null, loading: boolean): BrainStatusView {
  if (loading) {
    return { state: 'connecting', label: 'CONNECTING...', cardLabel: '… Connecting', reason: '' };
  }
  if (!runtime || runtime.status === 'not_booted') {
    return {
      state: 'not_booted',
      label: 'NOT BOOTED',
      cardLabel: '⚪ Not booted',
      reason: 'Heartbeat not running, so the Brain is not scanning content right now.',
    };
  }
  if (runtime.status === 'online' && runtime.soulVerified === true) {
    return { state: 'online', label: 'ONLINE', cardLabel: '🟢 Online', reason: '' };
  }
  if (runtime.status === 'degraded') {
    return {
      state: 'degraded',
      label: 'DEGRADED',
      cardLabel: '🟡 Degraded',
      reason: 'The soul inscription could not be verified, so the Brain is not taking actions.',
    };
  }
  const raw = runtime.status === 'online' ? 'unverified' : runtime.status || 'unknown';
  return {
    state: 'unknown',
    label: raw.toUpperCase(),
    cardLabel: `⚪ ${raw}`,
    reason: 'The Brain has not verified its soul inscription this boot.',
  };
}
