/**
 * @jest-environment jsdom
 */

/**
 * The block page's one Share (decision 13): on a touch phone with the share
 * sheet, one `navigator.share` call with the canonical URL; elsewhere a menu
 * with Copy link, Post on X and an inline QR code of the same URL.
 */

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('qrcode.react', () => ({
  QRCodeSVG: (p: { value: string }) => <svg data-testid="qr" data-value={p.value} />,
}));

import ShareMenu, { CANONICAL_ORIGIN, canonicalBlockUrl } from '@/app/(site)/block/[height]/share-menu';

const HEIGHT = 612888;
const URL_612888 = `${CANONICAL_ORIGIN}/block/${HEIGHT}`;

function setPointer(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }),
  });
}

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

describe('Share', () => {
  it('the canonical URL is the production origin plus /block/<h>', () => {
    expect(CANONICAL_ORIGIN).toBe('https://blockgenomics.io');
    expect(canonicalBlockUrl(HEIGHT)).toBe(URL_612888);
  });

  it('on a touch phone with the share sheet: one navigator.share call with the canonical URL, no menu', async () => {
    setPointer(true);
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareMenu height={HEIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: `Block ${HEIGHT} on Block Genomics`, url: URL_612888 });
    expect(screen.queryByTestId('share-menu')).toBeNull();
  });

  it('a rejected share sheet does nothing', async () => {
    setPointer(true);
    const share = jest.fn().mockRejectedValue(new Error('AbortError'));
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareMenu height={HEIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    await Promise.resolve();
    expect(screen.queryByTestId('share-menu')).toBeNull();
  });

  it('without navigator.share: the menu has Copy link, Post on X and the QR code of the canonical URL', () => {
    setPointer(false);
    render(<ShareMenu height={HEIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    const menu = screen.getByTestId('share-menu');
    expect(menu.textContent).toContain('Copy link');
    const x = screen.getByRole('link', { name: /post on x/i });
    expect(x.getAttribute('href')).toBe(
      `https://x.com/intent/post?url=${encodeURIComponent(URL_612888)}&text=${encodeURIComponent(`Block ${HEIGHT} on Block Genomics`)}`,
    );
    expect(x.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe(URL_612888);
    expect(menu.textContent).toContain(`Point a phone camera here to open ${HEIGHT}. The link card shows the block's artwork.`);
  });

  it('a mouse pointer gets the menu even when navigator.share exists', () => {
    setPointer(false);
    const share = jest.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareMenu height={HEIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByTestId('share-menu')).toBeTruthy();
  });

  it('Escape closes the menu', () => {
    setPointer(false);
    render(<ShareMenu height={HEIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('share-menu')).toBeNull();
  });
});
