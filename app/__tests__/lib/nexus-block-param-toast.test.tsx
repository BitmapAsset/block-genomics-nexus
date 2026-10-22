/**
 * @jest-environment jsdom
 */

/**
 * QA 2026-10-22 #27: /nexus?block=abc silently discarded the value and showed the
 * map. It now says "Block abc not found" once, then shows the map.
 */

import fs from 'fs';
import path from 'path';
import { act, render } from '@testing-library/react';
import BlockParamToast, { blockParamNotice } from '@/components/nexus/BlockParamToast';

describe('blockParamNotice', () => {
  it.each([
    ['abc', 'Block abc not found'],
    ['840000junk', 'Block 840000junk not found'],
    ['-5', 'Block -5 not found'],
    ['x'.repeat(40), `Block ${'x'.repeat(24)}… not found`],
  ])('%s → %s', (raw, want) => {
    expect(blockParamNotice(raw)).toBe(want);
  });

  it.each([null, '', '   ', '718840', '0'])('says nothing for %p', (raw) => {
    expect(blockParamNotice(raw as string | null)).toBeNull();
  });
});

describe('BlockParamToast', () => {
  it('shows the note, then hides it', () => {
    jest.useFakeTimers();
    const { queryByRole } = render(<BlockParamToast raw="abc" ms={4000} />);
    expect(queryByRole('status')?.textContent).toBe('Block abc not found');
    act(() => {
      jest.advanceTimersByTime(4100);
    });
    expect(queryByRole('status')).toBeNull();
    jest.useRealTimers();
  });

  it('keeps the note when the map then removes the bad value from the URL', () => {
    const { queryByRole, rerender } = render(<BlockParamToast raw="abc" />);
    rerender(<BlockParamToast raw={null} />);
    expect(queryByRole('status')?.textContent).toBe('Block abc not found');
  });

  it('renders nothing for a valid block', () => {
    const { queryByRole } = render(<BlockParamToast raw="718840" />);
    expect(queryByRole('status')).toBeNull();
  });

  it('is mounted by the /nexus page with the raw ?block= value', () => {
    const appDir = path.join(__dirname, '..', '..', 'src', 'app');
    const candidates = [path.join(appDir, 'nexus'), ...fs.readdirSync(appDir).filter((d) => /^\(.+\)$/.test(d)).map((d) => path.join(appDir, d, 'nexus'))];
    const dir = candidates.find((d) => fs.existsSync(d))!;
    const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    expect(src).toMatch(/<BlockParamToast raw=\{searchParams\.get\('block'\)\}/);
  });
});
