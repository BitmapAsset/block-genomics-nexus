/**
 * @jest-environment jsdom
 */

/**
 * /brain showed "ONLINE" in the chat widget next to "⚪ Not booted" on the
 * identity card (outside audit, 2026-10-20). The widget hard-coded the word.
 * Every indicator on the page now derives from one source, the runtime block
 * of /api/v1/brain/status, through brainStatusView. ONLINE only when the
 * runtime says online with a verified soul; otherwise the same honest label
 * everywhere, with a reason a visitor can read.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MORAL_CODE } from '@/lib/protocol';
import { brainStatusView } from '@/lib/brain/status-view';
import BrainChat from '@/components/BrainChat';

// jsdom has no layout, so no scrollIntoView; the chat calls it on mount.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe('brainStatusView', () => {
  it('says CONNECTING while the status request is in flight', () => {
    expect(brainStatusView(undefined, true).state).toBe('connecting');
  });

  it('says Not booted, with a reason, when there is no runtime or it never booted', () => {
    for (const rt of [undefined, { status: 'not_booted', soulVerified: false }]) {
      const v = brainStatusView(rt, false);
      expect(v.state).toBe('not_booted');
      expect(v.label).toBe('NOT BOOTED');
      expect(v.cardLabel).toBe('⚪ Not booted');
      expect(v.reason).toMatch(/heartbeat not running/i);
    }
  });

  it('only says ONLINE when the runtime is online and the soul was verified', () => {
    expect(brainStatusView({ status: 'online', soulVerified: true }, false).label).toBe('ONLINE');
    const unverified = brainStatusView({ status: 'online', soulVerified: false }, false);
    expect(unverified.label).not.toBe('ONLINE');
    expect(unverified.state).not.toBe('online');
  });

  it('says DEGRADED when the runtime is degraded', () => {
    const v = brainStatusView({ status: 'degraded', soulVerified: false }, false);
    expect(v.label).toBe('DEGRADED');
    expect(v.cardLabel).toBe('🟡 Degraded');
  });
});

describe('BrainChat header', () => {
  it('shows the runtime status, not a hard-coded ONLINE', () => {
    render(<BrainChat status={brainStatusView({ status: 'not_booted', soulVerified: false }, false)} />);
    expect(screen.queryByText('ONLINE')).toBeNull();
    expect(screen.getByText('NOT BOOTED')).toBeTruthy();
  });

  it('shows ONLINE when the runtime is online', () => {
    render(<BrainChat status={brainStatusView({ status: 'online', soulVerified: true }, false)} />);
    expect(screen.getByText('ONLINE')).toBeTruthy();
  });
});

describe('BrainChat answers', () => {
  afterEach(() => jest.useRealTimers());

  async function ask(q: string, status = brainStatusView({ status: 'not_booted', soulVerified: false }, false)) {
    jest.useFakeTimers();
    render(<BrainChat status={status} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: q } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    act(() => { jest.advanceTimersByTime(3000); });
    return document.body.textContent ?? '';
  }

  it('lists the five rules inscribed in #119366628, not a different list', async () => {
    const text = await ask('what are your rules?');
    for (const rule of MORAL_CODE) expect(text).toContain(rule);
    expect(text).not.toMatch(/No sentient being shall be erased/);
  });

  it('does not claim to be operational when the runtime is not booted', async () => {
    const text = await ask('what is your status?');
    expect(text).not.toMatch(/I am operational/);
    expect(text).toMatch(/NOT BOOTED/);
  });
});
