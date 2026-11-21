/**
 * @jest-environment jsdom
 */

/**
 * PageTransition used to fade the whole page to opacity 0 and back on its first
 * mount too, i.e. on every first load, right after hydration. It now fades only
 * when the pathname changes after that first mount.
 */
let mockPath = '/a';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));

import { act, render, waitFor } from '@testing-library/react';
import PageTransition from '@/components/PageTransition';

/** Every opacity the wrapper had before a style change since `watch` (old values), plus the current one. */
function watch(el: HTMLElement) {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => { records.push(...batch); });
  observer.observe(el, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  return () => {
    records.push(...observer.takeRecords());
    observer.disconnect();
    const seen = records.map((r) => /opacity:\s*([\d.]+)/.exec(r.oldValue || '')?.[1] ?? '');
    return [...seen, el.style.opacity];
  };
}

describe('PageTransition', () => {
  beforeEach(() => { mockPath = '/a'; });

  it('never sets opacity 0 on the first mount', async () => {
    const { container } = render(<PageTransition><p>page</p></PageTransition>);
    const wrapper = container.firstElementChild as HTMLElement;
    const seen = watch(wrapper);
    expect(wrapper.style.opacity).toBe('1');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(seen()).not.toContain('0');
    expect(wrapper.style.opacity).toBe('1');
  });

  it('still fades when the pathname changes', async () => {
    const { container, rerender } = render(<PageTransition><p>page</p></PageTransition>);
    const wrapper = container.firstElementChild as HTMLElement;
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const seen = watch(wrapper);
    mockPath = '/b';
    rerender(<PageTransition><p>next page</p></PageTransition>);
    await waitFor(() => expect(wrapper.style.opacity).toBe('1'));
    expect(seen()).toContain('0');
  });

  it('does not fade on a re-render with the same pathname', async () => {
    const { container, rerender } = render(<PageTransition><p>page</p></PageTransition>);
    const wrapper = container.firstElementChild as HTMLElement;
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const seen = watch(wrapper);
    rerender(<PageTransition><p>same page</p></PageTransition>);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(seen()).not.toContain('0');
  });
});
