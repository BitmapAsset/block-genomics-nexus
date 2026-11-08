/**
 * When the phone dock shows. The hero's main action counts as seen while part
 * of it is visible below the site's sticky header (components/Header) and none
 * of it sits under the fixed bottom tab bar (components/pwa/BottomTabBar). On a
 * 390 × 844 phone the action can sit right under that bar on the first screen,
 * or scroll fully behind the header; there it is covered, so the dock shows
 * Enter the block and Share instead. Partly behind the header still counts as
 * seen: the dock does not cover the top of the screen, and two orange buttons
 * never show at once.
 */

export interface VerticalBox {
  top: number;
  bottom: number;
}

/** Rounding slack between the observer's root and the button's own box. */
const SLACK_PX = 1;

/**
 * True when the hero's action is not seen: scrolled away past the top, fully
 * behind the sticky header, or (even partly) under the tab bar or below the screen.
 */
export function heroCoveredOrAway(rect: VerticalBox, viewportHeight: number, tabBarHeight: number, headerHeight = 0): boolean {
  return (
    rect.top < -SLACK_PX ||
    (headerHeight > 0 && rect.bottom <= headerHeight + SLACK_PX) ||
    rect.bottom > viewportHeight - tabBarHeight + SLACK_PX
  );
}

/**
 * The observer watches the viewport minus the header at the top and the tab bar
 * at the bottom, and fires when the button starts or stops touching that area
 * (0) and when the whole button enters or leaves it (1): so on the header line,
 * the tab bar line and both screen edges.
 */
export function dockObserverOptions(tabBarHeight: number, headerHeight = 0): IntersectionObserverInit {
  const px = (n: number) => Math.max(0, Math.round(n));
  return { rootMargin: `-${px(headerHeight)}px 0px -${px(tabBarHeight)}px 0px`, threshold: [0, 1] };
}

/**
 * The tab bar's height as drawn (56 px items, a 1 px border and the safe-area
 * inset), or 0 when it is not shown (768 px and up). The header's own nav shares
 * its label but is not fixed, so only the fixed one counts.
 */
export function measureTabBar(doc: Document): number {
  for (const nav of doc.querySelectorAll('nav[aria-label="Primary"]')) {
    if (getComputedStyle(nav).position === 'fixed') return nav.getBoundingClientRect().height;
  }
  return 0;
}

/**
 * The height of the page's sticky or fixed top header (64 px and a 1 px border
 * on this site), or 0 when there is none. Headings inside cards use `header`
 * too; they sit in the flow and are skipped.
 */
export function measureHeader(doc: Document): number {
  for (const el of doc.querySelectorAll('header')) {
    const style = getComputedStyle(el);
    if ((style.position === 'sticky' || style.position === 'fixed') && style.top === '0px') {
      return el.getBoundingClientRect().height;
    }
  }
  return 0;
}
