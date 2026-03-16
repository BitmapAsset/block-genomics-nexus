"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getVisitCount,
  isInstallDismissed,
  isAppInstalled,
  dismissInstallPrompt,
  markInstalled,
  isPWAMode,
} from "@/lib/pwa-utils";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed or in standalone mode
    if (isAppInstalled() || isPWAMode()) return;

    // Need at least 2 visits
    if (getVisitCount() < 2) return;

    // Don't show if recently dismissed
    if (isInstallDismissed()) return;

    // iOS detection (no beforeinstallprompt on Safari)
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isiOS);

    if (isiOS) {
      // Show iOS-specific instructions after delay
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }

    // Chrome/Edge/Firefox — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 2000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      markInstalled();
    }
    setDeferredPrompt(null);
    setVisible(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    dismissInstallPrompt();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md md:bottom-6 md:left-auto md:right-6">
      <div className="glass-panel overflow-hidden rounded-2xl border border-bitcoin/30 shadow-lg shadow-bitcoin/10">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-bitcoin via-accent-cyan to-accent-purple" />

        <div className="p-4">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Mini DNA icon */}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bitcoin/10">
                <span className="text-lg">🧬</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Install Block Genomics
                </h3>
                <p className="text-xs text-text-muted">
                  Get the full app experience
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-text-muted transition-colors hover:text-text-secondary"
              aria-label="Dismiss"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {isIOS ? (
            <div className="mb-3 rounded-lg bg-bg-tertiary/50 p-3">
              <p className="text-xs text-text-secondary">
                Tap{" "}
                <span className="inline-flex items-center rounded bg-bg-secondary px-1.5 py-0.5 text-accent-cyan">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                </span>{" "}
                then <strong className="text-text-primary">Add to Home Screen</strong>
              </p>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              className="w-full rounded-lg bg-bitcoin py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-[0.98]"
            >
              Install App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
