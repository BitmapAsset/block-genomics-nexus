'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from 'lucide-react';
import { primaryButton } from '@/components/ui/button';
import ShareMenu from './share-menu';
import { dockObserverOptions, heroCoveredOrAway, measureTabBar } from './dock-visibility';

/**
 * The phone dock: Enter the block and Share, below 768 px, sitting directly on
 * top of the site's bottom tab bar (components/pwa/BottomTabBar: 56 px items, a
 * 1 px top border, then the safe-area inset, which the tab bar already takes).
 * Drawn on the client only (nothing in the server HTML); the page reserves its
 * height with CSS, so its arrival shifts nothing.
 * It shows while the hero's own action is not fully visible above the tab bar
 * (covered by it on the first screen, or scrolled away), so a view never has
 * two orange buttons and the first screen always has one; it never carries
 * `data-primary`.
 */
export default function PhoneDock({ height }: { height: number }) {
  const [mounted, setMounted] = useState(false);
  const [heroInView, setHeroInView] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hero = document.querySelector('[data-primary]');
    if (!hero || typeof IntersectionObserver !== 'function') return;
    const tabBar = measureTabBar(document);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setHeroInView(!heroCoveredOrAway(e.boundingClientRect, window.innerHeight, tabBar));
    }, dockObserverOptions(tabBar));
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  if (!mounted || heroInView) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-40 border-t border-line-2 bg-bg-primary/95 px-4 py-3 backdrop-blur md:hidden"
      data-testid="phone-dock"
    >
      <div className="flex items-center gap-3">
        <Link href={`/world/${height}`} className={`${primaryButton} min-h-[54px] flex-1`}>
          <Navigation size={18} strokeWidth={1.75} aria-hidden="true" />
          Enter the block
        </Link>
        <ShareMenu height={height} placement="up" />
      </div>
    </div>
  );
}
