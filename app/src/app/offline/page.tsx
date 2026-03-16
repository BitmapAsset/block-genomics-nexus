"use client";

import { useEffect, useState } from "react";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) {
    // Redirect back when online
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      {/* DNA helix animation */}
      <div className="mb-8 flex gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 w-2 rounded-full bg-gradient-to-b from-accent-cyan to-accent-purple"
            style={{
              animation: `dnaFloat 1.5s ease-in-out ${i * 0.15}s infinite alternate`,
            }}
          />
        ))}
      </div>

      <h1 className="mb-4 text-3xl font-bold">
        <span className="bg-gradient-to-r from-accent-cyan to-accent-purple bg-clip-text text-transparent">
          Offline Mode
        </span>
      </h1>

      <p className="mb-6 max-w-md text-text-secondary">
        You&apos;re currently offline. Some features are unavailable, but your
        cached data is still accessible.
      </p>

      <div className="glass-panel mb-8 max-w-sm rounded-xl p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Available Offline
        </h2>
        <ul className="space-y-2 text-left text-sm text-text-secondary">
          <li className="flex items-center gap-2">
            <span className="text-success">●</span> Previously viewed blocks
          </li>
          <li className="flex items-center gap-2">
            <span className="text-success">●</span> Cached profile data
          </li>
          <li className="flex items-center gap-2">
            <span className="text-success">●</span> Agent directory (cached)
          </li>
        </ul>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-bitcoin px-6 py-3 font-medium text-black transition-opacity hover:opacity-90"
      >
        Try Again
      </button>

      <style jsx>{`
        @keyframes dnaFloat {
          0% {
            transform: scaleY(0.5);
            opacity: 0.4;
          }
          100% {
            transform: scaleY(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
