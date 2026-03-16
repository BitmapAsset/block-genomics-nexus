// PWA utilities — push subscriptions, offline queue, install tracking

// ── Service Worker Registration ──
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Handle updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
          // New version available — could show update prompt
          window.dispatchEvent(new CustomEvent("sw-updated"));
        }
      });
    });

    return registration;
  } catch (err) {
    console.error("SW registration failed:", err);
    return null;
  }
}

// ── Push Notifications ──
export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn("VAPID key not configured — push disabled");
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });

    // Send subscription to backend
    await fetch("/api/v1/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });

    return subscription;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await fetch("/api/v1/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  }
}

// ── Offline Action Queue ──
const DB_NAME = "bg-offline";
const STORE_NAME = "offline-queue";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface OfflineAction {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

export async function queueOfflineAction(action: Omit<OfflineAction, "timestamp">): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add({ ...action, timestamp: Date.now() });

  // Request background sync if available
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const registration = await navigator.serviceWorker.ready;
    await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("bg-offline-actions");
  }
}

export async function getQueuedActions(): Promise<OfflineAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Install Tracking ──
const VISIT_COUNT_KEY = "bg-pwa-visits";
const INSTALL_DISMISSED_KEY = "bg-pwa-install-dismissed";
const INSTALLED_KEY = "bg-pwa-installed";

export function trackVisit(): number {
  const count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10) + 1;
  localStorage.setItem(VISIT_COUNT_KEY, String(count));
  return count;
}

export function getVisitCount(): number {
  return parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10);
}

export function dismissInstallPrompt(): void {
  localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
}

export function isInstallDismissed(): boolean {
  const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
  if (!dismissed) return false;
  // Re-show after 7 days
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - parseInt(dismissed, 10) < weekMs;
}

export function markInstalled(): void {
  localStorage.setItem(INSTALLED_KEY, "true");
}

export function isAppInstalled(): boolean {
  return localStorage.getItem(INSTALLED_KEY) === "true";
}

export function isPWAMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ── Helpers ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
