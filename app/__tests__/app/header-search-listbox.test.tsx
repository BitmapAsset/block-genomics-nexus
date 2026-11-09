/** @jest-environment jsdom */
/**
 * The header search, for keyboard and screen reader users:
 * - the result rows form a named list of options in named groups (Blocks, Agents, Users); the arrow keys move the
 *   selection and the box names the selected option (`aria-activedescendant`), so a screen reader hears it;
 * - the rows are out of the Tab order (the arrows and Enter are the keyboard path);
 * - the panel closes when focus leaves the page (a blur with no new target), unless a press inside the search is under
 *   way (a row click in Safari blurs the box to the page before the click lands).
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn() }),
}));

import GlobalSearch from '@/components/GlobalSearch';

const DATA = {
  blocks: [
    { type: 'block', height: 612888, url: '/block/612888', label: 'A seeded block' },
    { type: 'block', height: 612889, url: '/block/612889' },
  ],
  agents: [{ type: 'agent', handle: 'helperbot', displayName: 'Helper Bot', url: '/agent/helperbot' }],
  users: [{ type: 'user', handle: 'localholder', displayName: 'Local Holder', url: '/u/localholder' }],
};

async function settle(ms = 260) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  push.mockClear();
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    json: async () => ({ success: true, data: JSON.parse(JSON.stringify(DATA)) }),
  }));
});

afterEach(() => {
  delete (global as unknown as { fetch?: unknown }).fetch;
});

/** Renders the search, types a query and waits for the results panel. */
async function withResults() {
  render(
    <div>
      <GlobalSearch />
      <button type="button">Elsewhere on the page</button>
    </div>,
  );
  await settle();
  const box = screen.getByLabelText('Search blocks and handles');
  act(() => box.focus());
  fireEvent.change(box, { target: { value: '6128' } });
  await settle();
  await waitFor(() => expect(screen.getByText('Block #612,889')).toBeTruthy());
  const outside = screen.getByRole('button', { name: 'Elsewhere on the page' });
  return { box, outside };
}

const listbox = () => screen.queryByRole('listbox', { name: 'Search results' });
/** A result row found by its text, whatever its role. */
const row = (text: string) => screen.getByText(text).closest('button, [role="option"]') as HTMLElement;
const resultsShowing = () => screen.queryByText('Block #612,889') !== null;

describe('header search results as a list of options', () => {
  it('the results are a named list with named groups, and every option is out of the Tab order', async () => {
    const { box } = await withResults();
    const list = listbox();
    expect(list).not.toBeNull();
    expect(box.getAttribute('aria-controls')).toBeTruthy();
    expect(document.getElementById(box.getAttribute('aria-controls') as string)!.contains(list)).toBe(true);
    for (const name of ['Blocks', 'Agents', 'Users']) {
      expect(within(list as HTMLElement).getByRole('group', { name })).toBeTruthy();
    }
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    for (const o of options) {
      expect(o.tabIndex).toBe(-1);
      expect(o.id).toBeTruthy();
      expect(o.getAttribute('aria-selected')).toBe('false');
    }
    expect(new Set(options.map((o) => o.id)).size).toBe(4);
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('the arrow keys move the selection and the box names the selected option', async () => {
    const { box } = await withResults();
    const options = () => screen.getAllByRole('option');

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    let id = box.getAttribute('aria-activedescendant');
    expect(id).toBe(options()[0].id);
    const first = document.getElementById(id as string)!;
    expect(first.getAttribute('role')).toBe('option');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    id = box.getAttribute('aria-activedescendant');
    expect(id).toBe(options()[1].id);
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');

    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box.getAttribute('aria-activedescendant')).toBe(options()[0].id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(0);
  });

  it('the selected option is scrolled into view inside the panel', async () => {
    const { box } = await withResults();
    const spy = jest.fn();
    for (const o of screen.getAllByRole('option')) (o as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(spy).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  it('Enter on a selection goes to that result', async () => {
    const { box } = await withResults();
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/agent/helperbot');
  });
});

describe('header search panel when focus leaves the page', () => {
  it('a blur with no new target and no press under way closes the panel', async () => {
    const { box } = await withResults();
    act(() => box.blur());
    expect(box.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(resultsShowing()).toBe(false));
  });

  it('a press on a row, then a blur with no new target, keeps the panel and the click goes to the row', async () => {
    const { box } = await withResults();
    const second = row('Block #612,889');
    fireEvent.pointerDown(second);
    fireEvent.mouseDown(second);
    act(() => box.blur());
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(resultsShowing()).toBe(true);
    fireEvent.pointerUp(second);
    fireEvent.mouseUp(second);
    fireEvent.click(second);
    expect(push).toHaveBeenCalledWith('/block/612889');
  });

  it('focus moving into the panel keeps it open', async () => {
    const { box } = await withResults();
    const first = row('Block #612,888');
    act(() => first.focus());
    expect(document.activeElement).toBe(first);
    expect(box.getAttribute('aria-expanded')).toBe('true');
  });

  it('focus moving to the page outside the search closes it', async () => {
    const { box, outside } = await withResults();
    act(() => outside.focus());
    expect(box.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(resultsShowing()).toBe(false));
  });
});
