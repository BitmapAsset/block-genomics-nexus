/**
 * @jest-environment jsdom
 */

/**
 * The phone dock on the first screen (bg98p item 1). The hero's main action
 * counts as seen only when it sits fully inside the viewport and above the
 * site's fixed bottom tab bar; while the tab bar covers it, or once it has
 * scrolled away, the dock shows Enter the block and Share instead. The
 * observer watches the viewport minus the tab bar's measured height, with
 * threshold 1. The real check runs in the 390 px browser shots.
 */

import { act, render, screen } from '@testing-library/react';

jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

import PhoneDock from '@/app/(site)/block/[height]/phone-dock';
import { dockObserverOptions, heroCoveredOrAway } from '@/app/(site)/block/[height]/dock-visibility';

const HEIGHT = 612888;
const VIEWPORT = 844;
const TAB_BAR = 57;

describe('heroCoveredOrAway', () => {
  it('fully visible above the tab bar: not covered', () => {
    expect(heroCoveredOrAway({ top: 500, bottom: 554 }, VIEWPORT, TAB_BAR)).toBe(false);
    expect(heroCoveredOrAway({ top: 733, bottom: 787 }, VIEWPORT, TAB_BAR)).toBe(false);
  });

  it('under the tab bar, even partly: covered', () => {
    expect(heroCoveredOrAway({ top: 760, bottom: 814 }, VIEWPORT, TAB_BAR)).toBe(true);
    expect(heroCoveredOrAway({ top: 740, bottom: 794 }, VIEWPORT, TAB_BAR)).toBe(true);
  });

  it('below the screen or scrolled past the top: away', () => {
    expect(heroCoveredOrAway({ top: 900, bottom: 954 }, VIEWPORT, TAB_BAR)).toBe(true);
    expect(heroCoveredOrAway({ top: -60, bottom: -6 }, VIEWPORT, TAB_BAR)).toBe(true);
    expect(heroCoveredOrAway({ top: -10, bottom: 44 }, VIEWPORT, TAB_BAR)).toBe(true);
  });

  it('no tab bar (desktop): the whole viewport counts', () => {
    expect(heroCoveredOrAway({ top: 790, bottom: 844 }, VIEWPORT, 0)).toBe(false);
  });
});

describe('dockObserverOptions', () => {
  it('the viewport minus the tab bar at the bottom, and the whole button', () => {
    expect(dockObserverOptions(TAB_BAR)).toEqual({ rootMargin: `0px 0px -${TAB_BAR}px 0px`, threshold: 1 });
    expect(dockObserverOptions(91)).toEqual({ rootMargin: '0px 0px -91px 0px', threshold: 1 });
    expect(dockObserverOptions(0)).toEqual({ rootMargin: '0px 0px -0px 0px', threshold: 1 });
  });
});

describe('the dock follows the hero action', () => {
  type Entry = { boundingClientRect: { top: number; bottom: number }; isIntersecting: boolean; intersectionRatio: number };
  let observed: { cb: (entries: Entry[]) => void; options: IntersectionObserverInit | undefined } | null = null;
  const original = (window as { IntersectionObserver?: unknown }).IntersectionObserver;
  const originalInner = window.innerHeight;

  beforeEach(() => {
    observed = null;
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
        observed = { cb, options };
      }
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT });
  });

  afterEach(() => {
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInner });
    document.body.innerHTML = '';
  });

  function page(tabBarHeight: number) {
    const hero = document.createElement('a');
    hero.setAttribute('data-primary', '');
    hero.textContent = 'Enter the block';
    document.body.appendChild(hero);
    // The header's own nav shares the label; it is not fixed, so it is never measured.
    const header = document.createElement('nav');
    header.setAttribute('aria-label', 'Primary');
    document.body.appendChild(header);
    const bar = document.createElement('nav');
    bar.setAttribute('aria-label', 'Primary');
    bar.style.position = 'fixed';
    bar.getBoundingClientRect = () => ({ height: tabBarHeight, top: VIEWPORT - tabBarHeight, bottom: VIEWPORT }) as DOMRect;
    document.body.appendChild(bar);
  }

  const at = (top: number, bottom: number): Entry => ({ boundingClientRect: { top, bottom }, isIntersecting: bottom > 0 && top < VIEWPORT, intersectionRatio: 0.5 });

  it('observes with the measured tab bar height and threshold 1', () => {
    page(91);
    render(<PhoneDock height={HEIGHT} />);
    expect(observed).not.toBeNull();
    expect(observed!.options).toEqual({ rootMargin: '0px 0px -91px 0px', threshold: 1 });
  });

  it('first screen with the action under the tab bar: the dock is up; above the bar: gone; scrolled past: back', () => {
    page(TAB_BAR);
    render(<PhoneDock height={HEIGHT} />);
    act(() => observed!.cb([at(760, 814)]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
    act(() => observed!.cb([{ ...at(500, 554), intersectionRatio: 1 }]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
    act(() => observed!.cb([at(-60, -6)]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
  });
});
