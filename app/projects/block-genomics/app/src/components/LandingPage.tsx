'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import LandingReveal from './LandingReveal';

const LandingBackground = dynamic(() => import('./LandingBackground'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, background: '#030308', zIndex: 0 }} />
  ),
});

const LandingAnimation = dynamic(() => import('./LandingAnimation'), {
  ssr: false,
  loading: () => null,
});

const LandingPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [animFaded, setAnimFaded] = useState(false);

  useEffect(() => {
    // Fade out the verification animation after it finishes (3.43s intro + 3s post-verify ambient)
    const timer = setTimeout(() => setAnimFaded(true), 6500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Immersive Nexus background — always visible but dimmed behind content */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, opacity: 0.8 }}>
        <LandingBackground />
      </div>
      
      {/* Verification animation overlay — stays visible (bubbles persist) */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <LandingAnimation />
      </div>
      
      {/* Content fades in after verification */}
      <LandingReveal>
        {children}
      </LandingReveal>
    </>
  );
};

export default LandingPage;
