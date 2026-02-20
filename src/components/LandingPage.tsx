'use client';

import React from 'react';
import LandingReveal from './LandingReveal';

/**
 * LandingPage — Beautiful animated background with floating bubbles/orbs
 * Pure CSS animations — zero JS per frame, loads instantly.
 */
const LandingPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {/* Animated background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          background: 'radial-gradient(ellipse at 30% 20%, rgba(247,147,26,0.12) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,255,204,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.06) 0%, transparent 60%), #030308',
          overflow: 'hidden',
        }}
      >
        {/* Large ambient orbs */}
        <div className="landing-orb orb-1" />
        <div className="landing-orb orb-2" />
        <div className="landing-orb orb-3" />
        <div className="landing-orb orb-4" />

        {/* Floating bubbles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`landing-bubble bubble-${i}`} />
        ))}

        {/* Grid overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'gridPulse 8s ease-in-out infinite',
        }} />

        {/* Horizontal scanline */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(0,255,204,0.4), rgba(247,147,26,0.4), transparent)',
          animation: 'scanline 6s linear infinite',
          opacity: 0.5,
        }} />

        {/* Vertical light beam */}
        <div style={{
          position: 'absolute',
          width: '2px',
          height: '100%',
          left: '50%',
          background: 'linear-gradient(180deg, transparent, rgba(247,147,26,0.15), rgba(168,85,247,0.15), transparent)',
          animation: 'verticalBeam 10s ease-in-out infinite',
          opacity: 0.3,
        }} />

        <style>{`
          /* Large glowing orbs */
          .landing-orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(40px);
            will-change: transform;
          }
          .orb-1 {
            width: 500px; height: 500px;
            background: radial-gradient(circle, rgba(247,147,26,0.2) 0%, rgba(247,147,26,0.05) 40%, transparent 70%);
            top: 5%; left: 10%;
            animation: orbFloat1 18s ease-in-out infinite;
          }
          .orb-2 {
            width: 450px; height: 450px;
            background: radial-gradient(circle, rgba(0,255,204,0.18) 0%, rgba(0,255,204,0.04) 40%, transparent 70%);
            bottom: 10%; right: 5%;
            animation: orbFloat2 22s ease-in-out infinite;
          }
          .orb-3 {
            width: 380px; height: 380px;
            background: radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.03) 40%, transparent 70%);
            top: 45%; left: 55%;
            animation: orbFloat3 26s ease-in-out infinite;
          }
          .orb-4 {
            width: 320px; height: 320px;
            background: radial-gradient(circle, rgba(102,204,255,0.12) 0%, rgba(102,204,255,0.03) 40%, transparent 70%);
            top: 20%; right: 25%;
            animation: orbFloat4 20s ease-in-out infinite;
          }

          /* Floating bubbles */
          .landing-bubble {
            position: absolute;
            border-radius: 50%;
            will-change: transform, opacity;
            pointer-events: none;
          }

          /* Generate 20 unique bubbles with varied sizes, positions, colors, and timing */
          .bubble-0  { width: 8px; height: 8px; background: rgba(247,147,26,0.6); left: 5%;  bottom: -10%; animation: bubbleRise 12s ease-in infinite 0s; }
          .bubble-1  { width: 12px; height: 12px; background: rgba(0,255,204,0.5); left: 15%; bottom: -10%; animation: bubbleRise 15s ease-in infinite 1s; }
          .bubble-2  { width: 6px; height: 6px; background: rgba(168,85,247,0.6); left: 25%; bottom: -10%; animation: bubbleRise 11s ease-in infinite 2s; }
          .bubble-3  { width: 14px; height: 14px; background: rgba(247,147,26,0.4); left: 35%; bottom: -10%; animation: bubbleRise 18s ease-in infinite 0.5s; }
          .bubble-4  { width: 10px; height: 10px; background: rgba(102,204,255,0.5); left: 45%; bottom: -10%; animation: bubbleRise 13s ease-in infinite 3s; }
          .bubble-5  { width: 7px; height: 7px; background: rgba(0,255,204,0.6); left: 55%; bottom: -10%; animation: bubbleRise 16s ease-in infinite 1.5s; }
          .bubble-6  { width: 16px; height: 16px; background: rgba(168,85,247,0.35); left: 65%; bottom: -10%; animation: bubbleRise 20s ease-in infinite 4s; }
          .bubble-7  { width: 9px; height: 9px; background: rgba(247,147,26,0.5); left: 75%; bottom: -10%; animation: bubbleRise 14s ease-in infinite 2.5s; }
          .bubble-8  { width: 11px; height: 11px; background: rgba(102,204,255,0.45); left: 85%; bottom: -10%; animation: bubbleRise 17s ease-in infinite 0.8s; }
          .bubble-9  { width: 5px; height: 5px; background: rgba(0,255,204,0.7); left: 95%; bottom: -10%; animation: bubbleRise 10s ease-in infinite 3.5s; }
          .bubble-10 { width: 13px; height: 13px; background: rgba(247,147,26,0.35); left: 10%; bottom: -10%; animation: bubbleRise 19s ease-in infinite 5s; }
          .bubble-11 { width: 8px; height: 8px; background: rgba(168,85,247,0.5); left: 20%; bottom: -10%; animation: bubbleRise 12s ease-in infinite 6s; }
          .bubble-12 { width: 15px; height: 15px; background: rgba(102,204,255,0.3); left: 30%; bottom: -10%; animation: bubbleRise 22s ease-in infinite 1.2s; }
          .bubble-13 { width: 7px; height: 7px; background: rgba(0,255,204,0.55); left: 40%; bottom: -10%; animation: bubbleRise 14s ease-in infinite 7s; }
          .bubble-14 { width: 10px; height: 10px; background: rgba(247,147,26,0.45); left: 50%; bottom: -10%; animation: bubbleRise 16s ease-in infinite 4.5s; }
          .bubble-15 { width: 6px; height: 6px; background: rgba(168,85,247,0.6); left: 60%; bottom: -10%; animation: bubbleRise 11s ease-in infinite 8s; }
          .bubble-16 { width: 18px; height: 18px; background: rgba(102,204,255,0.25); left: 70%; bottom: -10%; animation: bubbleRise 24s ease-in infinite 2s; }
          .bubble-17 { width: 9px; height: 9px; background: rgba(0,255,204,0.5); left: 80%; bottom: -10%; animation: bubbleRise 13s ease-in infinite 5.5s; }
          .bubble-18 { width: 12px; height: 12px; background: rgba(247,147,26,0.4); left: 90%; bottom: -10%; animation: bubbleRise 15s ease-in infinite 3.2s; }
          .bubble-19 { width: 7px; height: 7px; background: rgba(168,85,247,0.55); left: 8%;  bottom: -10%; animation: bubbleRise 17s ease-in infinite 9s; }

          /* Bubble glow effect */
          .landing-bubble {
            box-shadow: 0 0 6px currentColor;
          }

          @keyframes bubbleRise {
            0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
            10% { opacity: 0.8; transform: translateY(-10vh) translateX(5px) scale(1); }
            50% { opacity: 0.6; transform: translateY(-55vh) translateX(-15px) scale(0.9); }
            90% { opacity: 0.3; transform: translateY(-100vh) translateX(10px) scale(0.7); }
            100% { opacity: 0; transform: translateY(-115vh) translateX(0) scale(0.5); }
          }

          @keyframes orbFloat1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(40px, -30px) scale(1.05); } 50% { transform: translate(20px, -60px) scale(0.95); } 75% { transform: translate(-20px, -20px) scale(1.02); } }
          @keyframes orbFloat2 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(-50px, 30px) scale(1.08); } 66% { transform: translate(30px, -40px) scale(0.95); } }
          @keyframes orbFloat3 { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(25px, -35px); } 50% { transform: translate(-30px, 15px); } 75% { transform: translate(15px, 25px); } }
          @keyframes orbFloat4 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-35px, 45px) scale(1.1); } }
          @keyframes gridPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
          @keyframes verticalBeam { 0%, 100% { opacity: 0.1; transform: translateX(0); } 25% { opacity: 0.4; transform: translateX(-20vw); } 50% { opacity: 0.2; transform: translateX(15vw); } 75% { opacity: 0.35; transform: translateX(-10vw); } }
        `}</style>
      </div>

      {/* Content */}
      <LandingReveal>
        {children}
      </LandingReveal>
    </>
  );
};

export default LandingPage;
