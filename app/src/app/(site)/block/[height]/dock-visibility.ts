/**
 * When the phone dock shows. The hero's main action counts as seen only while
 * it sits fully inside the viewport and above the site's fixed bottom tab bar
 * (components/pwa/BottomTabBar). On a 390 × 844 phone the action can sit right
 * under that bar on the first screen; there it is covered, so the dock shows
 * Enter the block and Share instead.
 */

export interface VerticalBox {
  top: number;
  bottom: number;
}

/** Rounding slack between the observer's root and the button's own box. */
const SLACK_PX = 1;

/** True when the hero's action is not fully visible above the tab bar: under it, below the screen, or scrolled away. */
export function heroCoveredOrAway(rect: VerticalBox, viewportHeight: number, tabBarHeight: number): boolean {
  return rect.top < -SLACK_PX || rect.bottom > viewportHeight - tabBarHeight + SLACK_PX;
}

/** The observer watches the viewport minus the tab bar at the bottom, and fires when the whole button enters or leaves it. */
export function dockObserverOptions(tabBarHeight: number): IntersectionObserverInit {
  return { rootMargin: `0px 0px -${Math.max(0, Math.round(tabBarHeight))}px 0px`, threshold: 1 };
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
