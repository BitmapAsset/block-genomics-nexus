/**
 * @jest-environment jsdom
 */

/**
 * The phone dock on the first screen (bg98p item 1, bg98p2 items 1 and 2). The
 * hero's main action counts as seen only while part of it is visible below the
 * site's sticky header and none of it sits under the fixed bottom tab bar;
 * fully behind the header, under the tab bar, or scrolled away, the dock shows
 * Enter the block and Share instead. The observer watches the viewport minus
 * the header at the top and the tab bar at the bottom, at thresholds 0 and 1,
 * and is rebuilt when a resize or a rotation changes either height. On the
 * header side the observer's own edge decides: an entry it reports as touching
 * the area is seen. The header is measured without its open phone menu. The
 * real check runs in the browser walks.
 */

import { act, render, screen } from '@testing-library/react';

jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

import PhoneDock from '@/app/(site)/block/[height]/phone-dock';
import { dockObserverOptions, heroCoveredOrAway, measureHeader } from '@/app/(site)/block/[height]/dock-visibility';

const HEIGHT = 612888;
const VIEWPORT = 844;
const TAB_BAR = 57;
const HEADER = 65;

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

describe('heroCoveredOrAway with the sticky header', () => {
  it('fully behind the header: covered', () => {
    expect(heroCoveredOrAway({ top: 5, bottom: 57 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
    expect(heroCoveredOrAway({ top: 14, bottom: 66 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
    expect(heroCoveredOrAway({ top: 0, bottom: 52 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
  });

  it('1 px or more visible below the header: seen', () => {
    expect(heroCoveredOrAway({ top: 15, bottom: 67 }, VIEWPORT, TAB_BAR, HEADER)).toBe(false);
    expect(heroCoveredOrAway({ top: 39, bottom: 91 }, VIEWPORT, TAB_BAR, HEADER)).toBe(false);
  });

  it('fully between the header and the tab bar: seen', () => {
    expect(heroCoveredOrAway({ top: 65, bottom: 117 }, VIEWPORT, TAB_BAR, HEADER)).toBe(false);
    expect(heroCoveredOrAway({ top: 735, bottom: 787 }, VIEWPORT, TAB_BAR, HEADER)).toBe(false);
  });

  it('partly under the tab bar: covered, with or without the header', () => {
    expect(heroCoveredOrAway({ top: 740, bottom: 794 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
    expect(heroCoveredOrAway({ top: 794, bottom: 846 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
  });

  it('a header of 0 keeps the rule without one', () => {
    const rects = [
      { top: 5, bottom: 57 },
      { top: -2, bottom: 50 },
      { top: 0, bottom: 52 },
      { top: 500, bottom: 554 },
      { top: 740, bottom: 794 },
      { top: 900, bottom: 954 },
    ];
    for (const r of rects) {
      expect(heroCoveredOrAway(r, VIEWPORT, TAB_BAR, 0)).toBe(heroCoveredOrAway(r, VIEWPORT, TAB_BAR));
    }
    expect(heroCoveredOrAway({ top: 5, bottom: 57 }, VIEWPORT, TAB_BAR, 0)).toBe(false);
  });
});

describe("heroCoveredOrAway with the observer's own edge", () => {
  it('within 1 px below the header line and touching the area: seen', () => {
    expect(heroCoveredOrAway({ top: 13.5, bottom: 65.5 }, VIEWPORT, TAB_BAR, HEADER, true)).toBe(false);
    expect(heroCoveredOrAway({ top: 14, bottom: 66 }, VIEWPORT, TAB_BAR, HEADER, true)).toBe(false);
  });

  it('fully behind the header and not touching the area: covered', () => {
    expect(heroCoveredOrAway({ top: 5, bottom: 57 }, VIEWPORT, TAB_BAR, HEADER, false)).toBe(true);
    expect(heroCoveredOrAway({ top: 13.5, bottom: 65.5 }, VIEWPORT, TAB_BAR, HEADER, false)).toBe(true);
  });

  it('no edge given: the rule by the box alone', () => {
    expect(heroCoveredOrAway({ top: 13.5, bottom: 65.5 }, VIEWPORT, TAB_BAR, HEADER)).toBe(true);
  });

  it('touching the area does not change the tab bar side or the top of the screen', () => {
    expect(heroCoveredOrAway({ top: 740, bottom: 794 }, VIEWPORT, TAB_BAR, HEADER, true)).toBe(true);
    expect(heroCoveredOrAway({ top: -10, bottom: 44 }, VIEWPORT, TAB_BAR, HEADER, true)).toBe(true);
  });
});

describe('dockObserverOptions', () => {
  it('the viewport minus the header at the top and the tab bar at the bottom, at both edges of the button', () => {
    expect(dockObserverOptions(TAB_BAR, HEADER)).toEqual({ rootMargin: '-65px 0px -57px 0px', threshold: [0, 1] });
    expect(dockObserverOptions(91, 64.6)).toEqual({ rootMargin: '-65px 0px -91px 0px', threshold: [0, 1] });
    expect(dockObserverOptions(0, 65)).toEqual({ rootMargin: '-65px 0px -0px 0px', threshold: [0, 1] });
  });

  it('no header: only the tab bar is taken off', () => {
    expect(dockObserverOptions(TAB_BAR)).toEqual({ rootMargin: '-0px 0px -57px 0px', threshold: [0, 1] });
    expect(dockObserverOptions(TAB_BAR, 0)).toEqual({ rootMargin: '-0px 0px -57px 0px', threshold: [0, 1] });
  });
});

describe('measureHeader', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function header(position: string, height: number, top = '0px') {
    const el = document.createElement('header');
    el.style.position = position;
    el.style.top = top;
    el.getBoundingClientRect = () => ({ height, top: 0, bottom: height }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }

  it('the sticky top header counts', () => {
    header('static', 40);
    header('sticky', HEADER);
    expect(measureHeader(document)).toBe(HEADER);
  });

  it('a fixed top header counts', () => {
    header('fixed', 72);
    expect(measureHeader(document)).toBe(72);
  });

  it('a header in the flow (a card heading) does not', () => {
    header('static', 40);
    header('relative', 30);
    expect(measureHeader(document)).toBe(0);
  });

  it('a sticky header that is not pinned to the top does not', () => {
    header('sticky', 50, 'auto');
    expect(measureHeader(document)).toBe(0);
  });

  it('no header: 0', () => {
    expect(measureHeader(document)).toBe(0);
  });

  it('the open phone menu inside the header does not count: the closed height', () => {
    const el = header('sticky', HEADER + 610);
    const menu = document.createElement('nav');
    menu.setAttribute('data-mobile-menu', '');
    menu.getBoundingClientRect = () => ({ height: 610, top: HEADER, bottom: HEADER + 610 }) as DOMRect;
    el.appendChild(menu);
    expect(measureHeader(document)).toBe(HEADER);
  });
});

describe('the dock follows the hero action', () => {
  type Entry = { boundingClientRect: { top: number; bottom: number }; isIntersecting: boolean; intersectionRatio: number };
  type Observer = { cb: (entries: Entry[]) => void; options: IntersectionObserverInit | undefined; observed: number; disconnected: boolean };
  let observers: Observer[] = [];
  let frames: FrameRequestCallback[] = [];
  let barHeight = TAB_BAR;
  let headerHeight = HEADER;
  const MENU = 610;
  const original = (window as { IntersectionObserver?: unknown }).IntersectionObserver;
  const originalInner = window.innerHeight;
  const originalRaf = window.requestAnimationFrame;
  const originalCaf = window.cancelAnimationFrame;
  const latest = () => observers[observers.length - 1];

  beforeEach(() => {
    observers = [];
    frames = [];
    barHeight = TAB_BAR;
    headerHeight = HEADER;
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      private rec: Observer;
      constructor(cb: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
        this.rec = { cb, options, observed: 0, disconnected: false };
        observers.push(this.rec);
      }
      observe() {
        this.rec.observed += 1;
      }
      disconnect() {
        this.rec.disconnected = true;
      }
    };
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    };
    window.cancelAnimationFrame = (id: number) => {
      frames[id - 1] = () => {};
    };
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT });
  });

  afterEach(() => {
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCaf;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInner });
    document.body.innerHTML = '';
  });

  function flushFrames() {
    const run = frames;
    frames = [];
    act(() => run.forEach((f) => f(0)));
  }

  function page(withHeader = true) {
    if (withHeader) {
      const head = document.createElement('header');
      head.style.position = 'sticky';
      head.style.top = '0px';
      // An open phone menu sits inside the sticky header and adds to its box.
      head.getBoundingClientRect = () => {
        const h = headerHeight + (head.querySelector('[data-mobile-menu]') ? MENU : 0);
        return { height: h, top: 0, bottom: h } as DOMRect;
      };
      document.body.appendChild(head);
    }
    const hero = document.createElement('a');
    hero.setAttribute('data-primary', '');
    hero.textContent = 'Enter the block';
    document.body.appendChild(hero);
    // The header's own nav shares the label; it is not fixed, so it is never measured.
    const headerNav = document.createElement('nav');
    headerNav.setAttribute('aria-label', 'Primary');
    document.body.appendChild(headerNav);
    const bar = document.createElement('nav');
    bar.setAttribute('aria-label', 'Primary');
    bar.style.position = 'fixed';
    bar.getBoundingClientRect = () => ({ height: barHeight, top: VIEWPORT - barHeight, bottom: VIEWPORT }) as DOMRect;
    document.body.appendChild(bar);
  }

  function openMenu() {
    const menu = document.createElement('nav');
    menu.setAttribute('data-mobile-menu', '');
    menu.getBoundingClientRect = () => ({ height: MENU, top: headerHeight, bottom: headerHeight + MENU }) as DOMRect;
    document.querySelector('header')?.appendChild(menu);
  }

  // As the real observer reports it: touching the area between the header and the tab bar.
  const at = (top: number, bottom: number): Entry => ({
    boundingClientRect: { top, bottom },
    isIntersecting: bottom >= headerHeight && top <= VIEWPORT - barHeight,
    intersectionRatio: 0.5,
  });

  it('observes with the measured header and tab bar heights and thresholds 0 and 1', () => {
    barHeight = 91;
    page();
    render(<PhoneDock height={HEIGHT} />);
    expect(observers).toHaveLength(1);
    expect(latest().options).toEqual({ rootMargin: '-65px 0px -91px 0px', threshold: [0, 1] });
    expect(latest().observed).toBe(1);
  });

  it('first screen with the action under the tab bar: the dock is up; above the bar: gone; scrolled past: back', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    act(() => latest().cb([at(760, 814)]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
    act(() => latest().cb([{ ...at(500, 554), intersectionRatio: 1 }]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
    act(() => latest().cb([at(-60, -6)]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
  });

  it('the action fully behind the sticky header: the dock is up; half behind it: the dock stays down', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    act(() => latest().cb([{ ...at(39, 91), intersectionRatio: 0.5 }]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
    act(() => latest().cb([{ ...at(5, 57), intersectionRatio: 0 }]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
    act(() => latest().cb([{ ...at(15, 67), intersectionRatio: 0.02 }]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
  });

  it('an entry within 1 px below the header line that the observer reports as touching: seen, the dock is down', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
    const entry = { ...at(13.5, 65.5), intersectionRatio: 0.01 };
    expect(entry.isIntersecting).toBe(true);
    act(() => latest().cb([entry]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
  });

  it('scrolling back up past the header line: the dock goes down at the crossing callback', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    const behind = { ...at(5, 57), intersectionRatio: 0 };
    expect(behind.isIntersecting).toBe(false);
    act(() => latest().cb([behind]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
    // The next callback: the button starts touching the area, landing 0.8 px below the line.
    const crossing = { ...at(13.8, 65.8), intersectionRatio: 0 };
    expect(crossing.isIntersecting).toBe(true);
    act(() => latest().cb([crossing]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
    // The whole button below the header: still down.
    act(() => latest().cb([{ ...at(65, 117), intersectionRatio: 1 }]));
    expect(screen.queryByTestId('phone-dock')).toBeNull();
  });

  it('a resize while the phone menu is open: the observer keeps its margins', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    expect(latest().options).toEqual({ rootMargin: '-65px 0px -57px 0px', threshold: [0, 1] });
    openMenu();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    flushFrames();
    expect(observers).toHaveLength(1);
    expect(observers[0].disconnected).toBe(false);
    expect(latest().options).toEqual({ rootMargin: '-65px 0px -57px 0px', threshold: [0, 1] });
  });

  it('a resize that changes the tab bar: a new observer with the new margins, the old one disconnected', () => {
    barHeight = 0; // first loaded at 768 px or wider: the bar is hidden
    page();
    render(<PhoneDock height={HEIGHT} />);
    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({ rootMargin: '-65px 0px -0px 0px', threshold: [0, 1] });

    barHeight = TAB_BAR; // turned to portrait: the bar shows
    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames).toHaveLength(1); // at most one re-measure per frame
    flushFrames();
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnected).toBe(true);
    expect(latest().disconnected).toBe(false);
    expect(latest().options).toEqual({ rootMargin: '-65px 0px -57px 0px', threshold: [0, 1] });
    expect(latest().observed).toBe(1);

    // The new observer's rule uses the new bar: the action under it now brings the dock up.
    act(() => latest().cb([at(794, 846)]));
    expect(screen.queryByTestId('phone-dock')).not.toBeNull();
  });

  it('a rotation that changes the header: a new observer', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    headerHeight = 56;
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });
    flushFrames();
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnected).toBe(true);
    expect(latest().options).toEqual({ rootMargin: '-56px 0px -57px 0px', threshold: [0, 1] });
  });

  it('a resize or rotation that changes nothing: no new observer', () => {
    page();
    render(<PhoneDock height={HEIGHT} />);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    flushFrames();
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });
    flushFrames();
    expect(observers).toHaveLength(1);
    expect(observers[0].disconnected).toBe(false);
  });

  it('unmount disconnects the observer and stops listening', () => {
    page();
    const view = render(<PhoneDock height={HEIGHT} />);
    view.unmount();
    expect(observers[0].disconnected).toBe(true);
    barHeight = 91;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    frames.forEach((f) => f(0));
    expect(observers).toHaveLength(1);
  });
});
