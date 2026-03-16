"use client";

import { useEffect } from "react";
import { registerServiceWorker, trackVisit, isPWAMode, markInstalled } from "@/lib/pwa-utils";

/**
 * Registers service worker and tracks visits.
 * Mount once in layout — renders nothing.
 */
export default function PWARegistration() {
  useEffect(() => {
    // Track visits for install prompt logic
    trackVisit();

    // Mark as installed if running in standalone mode
    if (isPWAMode()) {
      markInstalled();
    }

    // Register service worker
    registerServiceWorker();

    // Listen for SW updates
    const handleUpdate = () => {
      // Could show a toast: "New version available — refresh to update"
      console.log("[PWA] New version available");
    };
    window.addEventListener("sw-updated", handleUpdate);
    return () => window.removeEventListener("sw-updated", handleUpdate);
  }, []);

  return null;
}
