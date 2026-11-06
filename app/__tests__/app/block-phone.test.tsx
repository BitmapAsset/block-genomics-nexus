/**
 * @jest-environment jsdom
 */

/**
 * The phone dock (bg98a item 9): Enter the block and Share pinned to the bottom
 * below 768 px. It is drawn on the client only, so the server HTML has no dock
 * and its arrival shifts nothing (the page reserves the space with CSS). It
 * never carries `data-primary`: the hero's action is the page's one. The real
 * 44 px and overflow checks run in the browser shots.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';

jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

import PhoneDock from '@/app/(site)/block/[height]/phone-dock';
import BlockLoading from '@/app/(site)/block/[height]/loading';

const HEIGHT = 612888;

describe('phone dock', () => {
  it('the server HTML has no dock', () => {
    expect(renderToStaticMarkup(<PhoneDock height={HEIGHT} />)).toBe('');
  });

  it('after mount: Enter the block and Share, no data-primary', () => {
    const { container } = render(<PhoneDock height={HEIGHT} />);
    const dock = screen.getByTestId('phone-dock');
    const enter = screen.getByRole('link', { name: 'Enter the block' });
    expect(enter.getAttribute('href')).toBe(`/world/${HEIGHT}`);
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(container.querySelector('[data-primary]')).toBeNull();
    expect(dock.className).toContain('md:hidden');
  });

  it('sits above the site tab bar (56 px items + a 1 px top border + the safe area), not at the screen edge', () => {
    render(<PhoneDock height={HEIGHT} />);
    const cls = screen.getByTestId('phone-dock').className.split(/\s+/);
    expect(cls).not.toContain('bottom-0');
    const offset = cls.find((c) => c.startsWith('bottom-['));
    expect(offset).toBeDefined();
    const m = offset!.match(/^bottom-\[calc\((\d+)px\+env\(safe-area-inset-bottom\)\)\]$/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(57);
    // Below the tab bar's z-50, so an open tab bar menu or sheet still wins; the offset keeps them apart.
    expect(cls).toContain('z-40');
  });
});

describe('loading', () => {
  it('a skeleton of the hero box and the three cards, dark, no spinner text', () => {
    const html = renderToStaticMarkup(<BlockLoading />);
    expect(html).toContain('bp-dark');
    expect(html).toContain('data-testid="block-loading-hero"');
    expect(html.match(/data-testid="block-loading-card"/g)).toHaveLength(3);
    expect(html).not.toContain('Loading block...');
  });
});
