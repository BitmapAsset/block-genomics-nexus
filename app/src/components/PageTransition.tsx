'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Lightweight page transition wrapper.
 * Fades content in on route change to avoid jarring hard cuts.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Brief fade-out then fade-in on route change
    setVisible(false);
    const timer = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, [pathname]);

  return (
    <div
      className="transition-opacity duration-200 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  );
}
