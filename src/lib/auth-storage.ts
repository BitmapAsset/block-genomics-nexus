export const STORAGE_KEYS = {
  handles: "bg_handles",
  profiles: "bg_profiles",
} as const;

export type HandleRegistry = Record<string, string>;

export interface StoredProfiles<T> {
  [handle: string]: T;
}

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

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getHandleRegistry(): HandleRegistry {
  return readStorage<HandleRegistry>(STORAGE_KEYS.handles, {});
}

export function setHandleRegistry(registry: HandleRegistry): void {
  writeStorage(STORAGE_KEYS.handles, registry);
}

export function getProfileRegistry<T>(): StoredProfiles<T> {
  return readStorage<StoredProfiles<T>>(STORAGE_KEYS.profiles, {});
}

export function setProfileRegistry<T>(registry: StoredProfiles<T>): void {
  writeStorage(STORAGE_KEYS.profiles, registry);
}
