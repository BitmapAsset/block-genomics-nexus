/**
 * The guardian chip on the block page (bg98a R5 and the gate-2 tone rule):
 * `guardianDisplayState` sits on top of `guardianCardState` and changes one
 * case only. While the deed cannot be checked on Bitcoin, a self-hosted
 * guardian's heartbeats are refused (api/v1/guardian/heartbeat), so its silence
 * says nothing: the chip reads amber "Not checked" with the last heartbeat. It
 * never turns anything green that `guardianCardState` would not.
 */

import { guardianCardState, guardianDisplayState, type BlockGuardianSummary } from '@/lib/blockGuardian';

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const H = 3_600_000;

function g(over: Partial<BlockGuardianSummary> = {}): BlockGuardianSummary {
  return {
    name: 'Atlas',
    status: 'active',
    selfHosted: false,
    lastHeartbeat: null,
    totalMessages: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    llmConfigured: true,
    lastChatAt: null,
    ...over,
  };
}

const display = (view: BlockGuardianSummary, deedKey: Parameters<typeof guardianDisplayState>[1]) =>
  guardianDisplayState(guardianCardState(view, NOW), deedKey, view, NOW);

describe('guardianDisplayState', () => {
  it('unreachable + self-hosted: amber "Not checked" with the last heartbeat and the paused line', () => {
    const view = g({ selfHosted: true, lastHeartbeat: new Date(NOW - 30 * H).toISOString() });
    const d = display(view, 'unreachable');
    expect(d.key).toBe('not-checked');
    expect(d.tone).toBe('warn');
    expect(d.label).toBe('Not checked · last heartbeat 30 h ago');
    expect(d.note).toBe("We can't check the deed on Bitcoin right now, so Atlas's check-ins are paused.");
  });

  it('unreachable + self-hosted with no heartbeat yet', () => {
    const d = display(g({ selfHosted: true }), 'unreachable');
    expect(d.label).toBe('Not checked · no heartbeat yet');
    expect(d.tone).toBe('warn');
  });

  it('unreachable + hosted: unchanged', () => {
    const view = g();
    const d = display(view, 'unreachable');
    const card = guardianCardState(view, NOW);
    expect({ key: d.key, label: d.label, live: d.live }).toEqual(card);
    expect(d.note).toBeUndefined();
  });

  it('disputed changes nothing, hosted or self-hosted', () => {
    for (const view of [g(), g({ selfHosted: true, lastHeartbeat: new Date(NOW - 30 * H).toISOString() })]) {
      const d = display(view, 'disputed');
      expect({ key: d.key, label: d.label, live: d.live }).toEqual(guardianCardState(view, NOW));
    }
  });

  it('verified: equals guardianCardState', () => {
    const view = g({ selfHosted: true, lastHeartbeat: new Date(NOW - 5 * 60_000).toISOString() });
    const d = display(view, 'verified');
    expect({ key: d.key, label: d.label, live: d.live }).toEqual(guardianCardState(view, NOW));
  });

  it('tones: answers-chat and a fresh self-hosted beat are ok; the rest neutral; never ok for a stale or paused one', () => {
    expect(display(g(), null).tone).toBe('ok');
    expect(display(g({ llmConfigured: false }), null).tone).toBe('neutral');
    expect(display(g({ selfHosted: true, lastHeartbeat: new Date(NOW - 5 * 60_000).toISOString() }), null).tone).toBe('ok');
    expect(display(g({ selfHosted: true, lastHeartbeat: new Date(NOW - 30 * H).toISOString() }), null).tone).toBe('neutral');
    expect(display(g({ selfHosted: true }), null).tone).toBe('neutral');
    expect(display(g({ status: 'paused' }), null).tone).toBe('neutral');
  });

  it('never yields ok during the outage, for any guardian', () => {
    const views = [
      g(),
      g({ llmConfigured: false }),
      g({ selfHosted: true, lastHeartbeat: new Date(NOW - 5 * 60_000).toISOString() }),
      g({ selfHosted: true }),
      g({ status: 'paused', selfHosted: true }),
    ];
    for (const v of views) {
      const d = display(v, 'unreachable');
      if (v.selfHosted) expect(d.tone).not.toBe('ok');
    }
  });
});
