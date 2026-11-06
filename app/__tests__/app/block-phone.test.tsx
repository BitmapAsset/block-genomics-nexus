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
    expect(dock.className).toContain('safe-area-inset-bottom');
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
