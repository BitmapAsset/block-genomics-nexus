'use client';
import React, { useEffect, useState, useCallback } from 'react';

/**
 * NexusWarpEntry — Lightweight CSS-based warp tunnel effect.
 * No canvas, no per-frame JS rendering. Pure CSS animations = smooth on all devices.
 */
export default function NexusWarpEntry({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'warp' | 'flash' | 'done'>('warp');

  const skip = useCallback(() => {
    setPhase('done');
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // Warp for 4s, then flash, then done
    const t1 = setTimeout(() => setPhase('flash'), 4000);
    const t2 = setTimeout(() => { setPhase('done'); onComplete(); }, 4600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [skip]);

  if (phase === 'done') return null;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden cursor-pointer"
      onClick={skip}
      style={{ background: '#020208' }}
    >
      {/* Warp tunnel rings — pure CSS animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: `${10 + i * 8}%`,
              height: `${10 + i * 8}%`,
              borderColor: i % 3 === 0 ? 'rgba(0,255,204,0.3)' : i % 3 === 1 ? 'rgba(168,85,247,0.25)' : 'rgba(247,147,26,0.2)',
              animation: `warpRing ${1.5 + i * 0.15}s ease-in infinite`,
              animationDelay: `${i * 0.12}s`,
              boxShadow: i % 3 === 0 ? '0 0 20px rgba(0,255,204,0.15)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Streaming particles — CSS only */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: '2px',
              height: `${20 + Math.random() * 60}px`,
              background: `linear-gradient(to bottom, transparent, ${['#00ffcc', '#a855f7', '#f7931a', '#66ccff'][i % 4]}, transparent)`,
              opacity: 0.4 + Math.random() * 0.4,
              animation: `warpStream ${0.8 + Math.random() * 1.2}s linear infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* ₿ symbols floating */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-2xl font-bold"
            style={{
              left: `${15 + Math.random() * 70}%`,
              top: `${10 + Math.random() * 80}%`,
              color: i % 2 === 0 ? '#f7931a' : '#00ffcc',
              opacity: 0.15 + Math.random() * 0.2,
              animation: `warpFloat ${2 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
              textShadow: `0 0 20px ${i % 2 === 0 ? 'rgba(247,147,26,0.5)' : 'rgba(0,255,204,0.5)'}`,
            }}
          >
            ₿
          </div>
        ))}
      </div>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="text-3xl sm:text-5xl font-black tracking-[0.3em] mb-4"
          style={{
            background: 'linear-gradient(135deg, #00ffcc, #ffffff, #a855f7, #f7931a)',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'warpTextShimmer 2s ease-in-out infinite',
            filter: 'drop-shadow(0 0 30px rgba(0,255,204,0.4))',
          }}
        >
          THE NEXUS
        </div>
        <div
          className="text-xs sm:text-sm tracking-[0.5em] uppercase"
          style={{
            color: 'rgba(0,255,204,0.6)',
            animation: 'warpPulse 1.5s ease-in-out infinite',
          }}
        >
          ⚡ Entering Bitcoin Space ⚡
        </div>
      </div>

      {/* Flash overlay */}
      {phase === 'flash' && (
        <div
          className="absolute inset-0"
          style={{
            background: 'white',
            animation: 'warpFlash 0.6s ease-out forwards',
          }}
        />
      )}

      {/* Skip hint */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <span className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Press ESC or tap to skip
        </span>
      </div>

      <style jsx>{`
        @keyframes warpRing {
          0% { transform: scale(0.3); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes warpStream {
          0% { transform: translateY(-100px); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes warpFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-20px) scale(1.2); }
        }
        @keyframes warpTextShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes warpPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes warpFlash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
