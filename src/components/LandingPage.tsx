'use client';

import React from 'react';
import LandingReveal from './LandingReveal';

/**
 * LandingPage — Lightweight CSS-only background
 * 
 * Replaced Three.js + postprocessing (1,663 lines, ~500KB JS)
 * with pure CSS animations. Zero JS per frame. Loads instantly.
 */
const LandingPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {/* CSS-only animated background — no Three.js needed */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          background: 'radial-gradient(ellipse at 30% 20%, rgba(247,147,26,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,255,204,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.04) 0%, transparent 60%), #030308',
          overflow: 'hidden',
        }}
      >
        {/* Floating orbs */}
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(247,147,26,0.12) 0%, transparent 70%)',
          top: '10%',
          left: '15%',
          animation: 'orbFloat1 20s ease-in-out infinite',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,255,204,0.1) 0%, transparent 70%)',
          bottom: '15%',
          right: '10%',
          animation: 'orbFloat2 25s ease-in-out infinite',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)',
          top: '50%',
          left: '60%',
          animation: 'orbFloat3 30s ease-in-out infinite',
          filter: 'blur(80px)',
        }} />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'gridPulse 8s ease-in-out infinite',
        }} />

        {/* Scanline */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(0,255,204,0.3), rgba(247,147,26,0.3), transparent)',
          animation: 'scanline 6s linear infinite',
          opacity: 0.4,
        }} />

        <style>{`
          @keyframes orbFloat1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(30px, -40px); } }
          @keyframes orbFloat2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-40px, 30px); } }
          @keyframes orbFloat3 { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(20px, -20px); } 66% { transform: translate(-30px, 10px); } }
          @keyframes gridPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
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
