/**
 * The guardian card's state (bg95) names the server's own `guardianLiveState`
 * (lib/block-events), so the card and the feed's `guardian.status` rows never
 * disagree. Boundaries: the 10-minute heartbeat window, a self-hosted guardian
 * that never sent a heartbeat, paused, stopped, hosted with and without an LLM.
 * No input yields "Working": no event carries a building state yet.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import * as blockGuardian from '@/lib/blockGuardian';
import { guardianLiveState, GUARDIAN_OFFLINE_AFTER_MS } from '@/lib/block-events';

type View = { status: string; selfHosted: boolean; lastHeartbeat: string | null; llmConfigured: boolean };
type CardState = { key: string; label: string; live: string };
// Absent on code before bg95; the cases fail rather than crash the file.
const guardianCardState = (blockGuardian as Record<string, unknown>).guardianCardState as
  | ((v: View, now: number) => CardState)
  | undefined;

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function card(v: Partial<View>): CardState {
  if (!guardianCardState) throw new Error('guardianCardState is missing');
  return guardianCardState({ status: 'active', selfHosted: false, lastHeartbeat: null, llmConfigured: false, ...v }, NOW);
}

function agrees(v: Partial<View>) {
  const full = { status: 'active', selfHosted: false, lastHeartbeat: null, llmConfigured: false, ...v };
  expect(card(full).live).toBe(guardianLiveState(full, NOW));
}

describe('guardianCardState', () => {
  it('self-hosted heartbeat 9:59 min ago → Idle', () => {
    const v = { selfHosted: true, lastHeartbeat: ago(GUARDIAN_OFFLINE_AFTER_MS - 1_000) };
    expect(card(v)).toMatchObject({ key: 'idle', label: 'Idle', live: 'idle' });
    agrees(v);
  });

  it('self-hosted heartbeat 10:01 min ago → Offline', () => {
    const v = { selfHosted: true, lastHeartbeat: ago(GUARDIAN_OFFLINE_AFTER_MS + 1_000) };
    expect(card(v)).toMatchObject({ key: 'offline', label: 'Offline', live: 'offline' });
    agrees(v);
  });

  it('self-hosted, never a heartbeat → No heartbeat yet', () => {
    const v = { selfHosted: true, lastHeartbeat: null };
    expect(card(v)).toMatchObject({ key: 'no-heartbeat', label: 'No heartbeat yet', live: 'offline' });
    agrees(v);
  });

  it('paused → Resting', () => {
    for (const selfHosted of [true, false]) {
      const v = { status: 'paused', selfHosted, lastHeartbeat: ago(60_000) };
      expect(card(v)).toMatchObject({ key: 'resting', label: 'Resting', live: 'resting' });
      agrees(v);
    }
  });

  it('stopped → Offline, hosted or self-hosted, with or without a heartbeat', () => {
    for (const selfHosted of [true, false]) {
      for (const lastHeartbeat of [null, ago(60_000)]) {
        const v = { status: 'stopped', selfHosted, lastHeartbeat };
        expect(card(v)).toMatchObject({ key: 'offline', label: 'Offline', live: 'offline' });
        agrees(v);
      }
    }
  });

  it('hosted with an LLM set up → Answers chat; without → Chat not set up', () => {
    expect(card({ selfHosted: false, llmConfigured: true })).toMatchObject({ label: 'Answers chat', live: 'idle' });
    expect(card({ selfHosted: false, llmConfigured: false })).toMatchObject({ label: 'Chat not set up', live: 'idle' });
    agrees({ selfHosted: false, llmConfigured: true });
  });

  it('agrees with guardianLiveState on every input, and no input yields Working', () => {
    const labels = new Set<string>();
    for (const status of ['active', 'paused', 'stopped', 'error', '', 'Online']) {
      for (const selfHosted of [true, false]) {
        for (const lastHeartbeat of [null, ago(0), ago(GUARDIAN_OFFLINE_AFTER_MS - 1), ago(GUARDIAN_OFFLINE_AFTER_MS), ago(30 * 3_600_000)]) {
          for (const llmConfigured of [true, false]) {
            const v = { status, selfHosted, lastHeartbeat, llmConfigured };
            const s = card(v);
            expect(s.live).toBe(guardianLiveState(v, NOW));
            labels.add(s.label);
          }
        }
      }
    }
    expect(labels.has('Working')).toBe(false);
    for (const l of labels) {
      expect(['Answers chat', 'Chat not set up', 'Idle', 'Resting', 'Offline', 'No heartbeat yet']).toContain(l);
    }
  });
});
