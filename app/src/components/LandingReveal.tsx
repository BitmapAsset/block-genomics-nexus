'use client';

import React, { useEffect, useState } from 'react';

const REVEAL_MS = 3430; // 3.43 seconds

interface LandingRevealProps {
  children: React.ReactNode;
}

/**
 * Fades in children after the 3.43s animation reveal.
 * Shows a subtle "Verifying…" text during the wait.
 */
const LandingReveal: React.FC<LandingRevealProps> = ({ children }) => {
  const [phase, setPhase] = useState<'waiting' | 'revealing' | 'done'>('waiting');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('revealing'), REVEAL_MS);
    const t2 = setTimeout(() => setPhase('done'), REVEAL_MS + 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <>
      {/* Verifying indicator during animation */}
      <div
        className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none"
        style={{
          opacity: phase === 'waiting' ? 1 : 0,
          transition: 'opacity 0.5s ease-out',
        }}
      >
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm text-text-muted animate-pulse">
            <span className="h-2 w-2 rounded-full bg-accent-cyan animate-ping" />
            Verifying identity…
          </div>
        </div>
      </div>

      {/* Soft dark gradient overlay for text readability */}
      <div
        className="fixed inset-0 z-15 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(3,3,8,0.1) 0%, rgba(3,3,8,0.25) 30%, rgba(3,3,8,0.35) 50%, rgba(3,3,8,0.5) 100%)',
          opacity: phase === 'waiting' ? 0 : 1,
          transition: 'opacity 1.5s ease-out',
        }}
      />

      {/* Main content overlay */}
      <div
        className="relative z-20"
        style={{
          opacity: phase === 'waiting' ? 0 : phase === 'revealing' ? 0.85 : 1,
          transform: phase === 'waiting' ? 'translateY(20px)' : 'translateY(0)',
          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        {children}
      </div>
    </>
  );
};

export default LandingReveal;
