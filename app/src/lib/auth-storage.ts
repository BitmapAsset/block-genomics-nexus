export const STORAGE_KEYS = {
  handles: "bg_handles",
  profiles: "bg_profiles",
} as const;

export type HandleRegistry = Record<string, string>;

export interface StoredProfiles<T> {
  [handle: string]: T;
}

/** Read and parse a JSON value from localStorage, returning fallback on failure */
export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage */
export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Get the local handle-to-wallet mapping from localStorage */
export function getHandleRegistry(): HandleRegistry {
  return readStorage<HandleRegistry>(STORAGE_KEYS.handles, {});
}

/** Save the handle-to-wallet mapping to localStorage */
export function setHandleRegistry(registry: HandleRegistry): void {
  writeStorage(STORAGE_KEYS.handles, registry);
}

/** Get the local profile registry from localStorage */
export function getProfileRegistry<T>(): StoredProfiles<T> {
  return readStorage<StoredProfiles<T>>(STORAGE_KEYS.profiles, {});
}

/** Save the profile registry to localStorage */
export function setProfileRegistry<T>(registry: StoredProfiles<T>): void {
  writeStorage(STORAGE_KEYS.profiles, registry);
}
