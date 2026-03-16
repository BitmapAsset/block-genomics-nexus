"use client";

import { useState, useEffect } from "react";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Only show splash in PWA mode
    const isPWA =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!isPWA) {
      setVisible(false);
      return;
    }

    // Check if already shown this session
    if (sessionStorage.getItem("bg-splash-shown")) {
      setVisible(false);
      return;
    }

    sessionStorage.setItem("bg-splash-shown", "1");

    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setVisible(false), 500);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-primary transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* DNA Helix Animation */}
      <div className="relative mb-8 h-32 w-16">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="absolute left-1/2 h-2 w-2 rounded-full"
            style={{
              top: `${i * 12.5}%`,
              transform: `translateX(${Math.sin((i / 8) * Math.PI * 2) * 20}px)`,
              backgroundColor: i % 2 === 0 ? "#66ccff" : "#a855f7",
              animation: `dnaOrbit 2s ease-in-out ${i * 0.12}s infinite`,
              boxShadow: `0 0 8px ${i % 2 === 0 ? "#66ccff" : "#a855f7"}`,
            }}
          />
        ))}
        {/* Mirror strand */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={`m-${i}`}
            className="absolute left-1/2 h-2 w-2 rounded-full"
            style={{
              top: `${i * 12.5}%`,
              transform: `translateX(${-Math.sin((i / 8) * Math.PI * 2) * 20}px)`,
              backgroundColor: i % 2 === 0 ? "#a855f7" : "#66ccff",
              animation: `dnaOrbit 2s ease-in-out ${i * 0.12 + 1}s infinite`,
              boxShadow: `0 0 8px ${i % 2 === 0 ? "#a855f7" : "#66ccff"}`,
            }}
          />
        ))}
      </div>

      {/* Logo text */}
      <h1 className="mb-2 bg-gradient-to-r from-accent-cyan via-white to-accent-purple bg-clip-text text-2xl font-bold tracking-wider text-transparent">
        BLOCK GENOMICS
      </h1>
      <p className="text-xs tracking-widest text-text-muted">
        BITCOIN DNA FOR VERIFIED AI
      </p>

      {/* Loading bar */}
      <div className="mt-8 h-0.5 w-32 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-bitcoin"
          style={{
            animation: "splashLoad 2s ease-in-out forwards",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes dnaOrbit {
          0%, 100% { opacity: 0.5; transform: translateX(var(--tw-translate-x, 0)) scale(0.8); }
          50% { opacity: 1; transform: translateX(calc(var(--tw-translate-x, 0) * -1)) scale(1.1); }
        }
        @keyframes splashLoad {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
