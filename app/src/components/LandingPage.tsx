'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import LandingReveal from './LandingReveal';
import WebGLErrorBoundary from './WebGLErrorBoundary';

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
    // Fade out the verification animation after it finishes (1.2s intro + 2s post-verify ambient)
    const timer = setTimeout(() => setAnimFaded(true), 3200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Immersive Nexus background — always visible but dimmed behind content */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, opacity: 0.8 }}>
        <WebGLErrorBoundary>
          <LandingBackground />
        </WebGLErrorBoundary>
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
        <WebGLErrorBoundary>
          <LandingAnimation />
        </WebGLErrorBoundary>
      </div>
      
      {/* Content fades in after verification */}
      <LandingReveal>
        {children}
      </LandingReveal>
    </>
  );
};

export default LandingPage;
