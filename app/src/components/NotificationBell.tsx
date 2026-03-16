"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useInbox, type InboxCategory } from "@/context/InboxContext";

const categoryConfig: Record<InboxCategory, { icon: string; color: string }> = {
  guardian: { icon: "shield", color: "text-purple-400" },
  transfer: { icon: "arrow-right", color: "text-green-400" },
  system: { icon: "info", color: "text-accent-cyan" },
  nexus: { icon: "globe", color: "text-orange-400" },
  delegation: { icon: "handshake", color: "text-yellow-400" },
};

function CategoryIcon({ category }: { category: InboxCategory }) {
  const config = categoryConfig[category];
  const paths: Record<string, string> = {
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    "arrow-right": "M5 12h14m-7-7l7 7-7 7",
    info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01",
    globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20",
    handshake: "M20.42 4.58a5.4 5.4 0 00-7.65 0l-.77.78-.77-.78a5.4 5.4 0 00-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z",
  };

  return (
    <svg className={`w-4 h-4 ${config.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {(paths[config.icon] || paths.info).split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead, clearAll } = useInbox();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg border border-border hover:border-border-hover hover:bg-bg-tertiary/30 transition-all cursor-pointer"
        aria-label="Notifications"
      >
        <svg className="w-4.5 h-4.5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] rounded-xl border border-border bg-bg-primary/95 backdrop-blur-xl shadow-2xl z-[100] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-accent-cyan hover:text-accent-cyan/80 transition-colors cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="overflow-y-auto max-h-[400px]">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-tertiary/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  </div>
                  <p className="text-sm text-text-muted">No notifications yet</p>
                  <p className="text-xs text-text-muted/60 mt-1">Activity will appear here</p>
                </div>
              ) : (
                items.map((item, index) => {
                  const content = (
                    <motion.div
                      initial={index < 3 ? { opacity: 0, x: -10 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer ${
                        !item.read ? "bg-accent-cyan/[0.03]" : ""
                      }`}
                      onClick={() => markRead(item.id)}
                    >
                      <div className="mt-0.5 shrink-0">
                        <CategoryIcon category={item.category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold truncate ${!item.read ? "text-text-primary" : "text-text-secondary"}`}>
                            {item.title}
                          </span>
                          {!item.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-text-muted truncate">{item.body}</p>
                        <span className="text-[10px] text-text-muted/60 mt-0.5 block">{timeAgo(item.timestamp)}</span>
                      </div>
                    </motion.div>
                  );

                  if (item.href) {
                    return (
                      <Link key={item.id} href={item.href} onClick={() => { markRead(item.id); setOpen(false); }}>
                        {content}
                      </Link>
                    );
                  }

                  return content;
                })
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <Link
                  href="/history"
                  onClick={() => setOpen(false)}
                  className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                >
                  View all activity
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
