"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type InboxCategory = "guardian" | "transfer" | "system" | "nexus" | "delegation";

export interface InboxItem {
  id: string;
  category: InboxCategory;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  href?: string;
  blockHeight?: number;
}

interface InboxContextValue {
  items: InboxItem[];
  unreadCount: number;
  addNotification: (item: Omit<InboxItem, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  removeItem: (id: string) => void;
}

const InboxContext = createContext<InboxContextValue | undefined>(undefined);

const STORAGE_KEY = "bg-inbox-v1";

function loadItems(): InboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InboxItem[];
  } catch {
    return [];
  }
}

function saveItems(items: InboxItem[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep max 100 notifications
    const trimmed = items.slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
}

let nextId = 0;

export function InboxProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InboxItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setItems(loadItems());
  }, []);

  // Persist on change
  useEffect(() => {
    if (items.length > 0 || loadItems().length > 0) {
      saveItems(items);
    }
  }, [items]);

  const unreadCount = items.filter((i) => !i.read).length;

  const addNotification = useCallback(
    (item: Omit<InboxItem, "id" | "timestamp" | "read">) => {
      const newItem: InboxItem = {
        ...item,
        id: `inbox-${Date.now()}-${++nextId}`,
        timestamp: Date.now(),
        read: false,
      };
      setItems((prev) => [newItem, ...prev].slice(0, 100));
    },
    [],
  );

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, read: true } : i)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return (
    <InboxContext.Provider
      value={{ items, unreadCount, addNotification, markRead, markAllRead, clearAll, removeItem }}
    >
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox(): InboxContextValue {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used within InboxProvider");
  return ctx;
}
