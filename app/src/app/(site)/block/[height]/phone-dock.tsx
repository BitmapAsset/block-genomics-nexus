'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from 'lucide-react';
import { primaryButton } from '@/components/ui/button';
import ShareMenu from './share-menu';
import { dockObserverOptions, heroCoveredOrAway, measureHeader, measureTabBar } from './dock-visibility';

/**
 * The phone dock: Enter the block and Share, below 768 px, sitting directly on
 * top of the site's bottom tab bar (components/pwa/BottomTabBar: 56 px items, a
 * 1 px top border, then the safe-area inset, which the tab bar already takes).
 * Drawn on the client only (nothing in the server HTML); the page reserves its
 * height with CSS, so its arrival shifts nothing.
 * It shows while the hero's own action is not seen: under the tab bar on the
 * first screen, fully behind the sticky header, or scrolled away. So a view
 * never has two orange buttons and the first screen always has one; it never
 * carries `data-primary`. The header and the tab bar are measured again after a
 * resize or a rotation (once per frame at most), and the observer is rebuilt
 * when either height changed.
 */
export default function PhoneDock({ height }: { height: number }) {
  const [mounted, setMounted] = useState(false);
  const [heroInView, setHeroInView] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hero = document.querySelector('[data-primary]');
    if (!hero || typeof IntersectionObserver !== 'function') return;
    let io: IntersectionObserver | null = null;
    let measured = { header: -1, tabBar: -1 };
    let frame = 0;

    const watch = () => {
      const header = measureHeader(document);
      const tabBar = measureTabBar(document);
      if (io && header === measured.header && tabBar === measured.tabBar) return;
      io?.disconnect();
      measured = { header, tabBar };
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          setHeroInView(!heroCoveredOrAway(e.boundingClientRect, window.innerHeight, tabBar, header, e.isIntersecting));
        }
      }, dockObserverOptions(tabBar, header));
      io.observe(hero);
    };
    const remeasure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        watch();
      });
    };

    watch();
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      if (frame) window.cancelAnimationFrame(frame);
      io?.disconnect();
    };
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
