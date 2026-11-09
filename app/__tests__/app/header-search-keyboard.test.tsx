/** @jest-environment jsdom */
/**
 * The header search opens its "Recent / Notable Blocks" panel only when asked (a click or tap in the box, ArrowDown,
 * Cmd/Ctrl+K, or results from typing), not when Tab merely passes through it; it closes the panel when keyboard focus
 * moves on to the rest of the page; and the box tells assistive tech whether the panel is showing.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn() }),
}));

import GlobalSearch from '@/components/GlobalSearch';

/** Lets the box's first (empty) debounced search run, as it does a moment after every page load. */
async function settle(ms = 260) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function setup() {
  render(
    <div>
      <GlobalSearch />
      <button type="button">Elsewhere on the page</button>
    </div>,
  );
  await settle();
  const box = screen.getByLabelText('Search blocks and handles');
  const outside = screen.getByRole('button', { name: 'Elsewhere on the page' });
  return { box, outside };
}

const notable = () => screen.queryByText('Notable Blocks');

describe('header search panel and the keyboard', () => {
  it('focus alone (Tab passing through) does not open the panel', async () => {
    const { box } = await setup();
    act(() => box.focus());
    await settle(50);
    expect(document.activeElement).toBe(box);
    expect(notable()).toBeNull();
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click in the box opens the panel, and the box says so', async () => {
    const { box } = await setup();
    act(() => box.focus());
    fireEvent.click(box);
    expect(notable()).not.toBeNull();
    const combo = screen.getByRole('combobox', { name: 'Search blocks and handles' });
    expect(combo).toBe(box);
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const panelId = box.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel!.contains(notable())).toBe(true);
  });

  it('ArrowDown in the box opens the panel', async () => {
    const { box } = await setup();
    act(() => box.focus());
    expect(notable()).toBeNull();
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(notable()).not.toBeNull();
    expect(box.getAttribute('aria-expanded')).toBe('true');
  });

  it('with the panel open, focus moving to the page outside the search closes it', async () => {
    const { box, outside } = await setup();
    act(() => box.focus());
    fireEvent.click(box);
    expect(notable()).not.toBeNull();
    act(() => outside.focus());
    expect(box.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(notable()).toBeNull());
  });

  it('focus moving from the box into the panel keeps it open', async () => {
    const { box } = await setup();
    act(() => box.focus());
    fireEvent.click(box);
    const first = screen.getByRole('button', { name: /Block #0/ });
    act(() => first.focus());
    expect(document.activeElement).toBe(first);
    expect(notable()).not.toBeNull();
    expect(box.getAttribute('aria-expanded')).toBe('true');
  });
});
