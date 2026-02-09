'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import LandingReveal from './LandingReveal';

const LandingAnimation = dynamic(() => import('./LandingAnimation'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 0 }} />
  ),
});

const LandingPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <LandingAnimation />
      <LandingReveal>
        {children}
      </LandingReveal>
    </>
  );
};

export default LandingPage;
