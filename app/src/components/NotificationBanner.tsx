"use client";

import { useNotifications, type NotificationType } from "@/context/NotificationContext";

const icons: Record<NotificationType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const styles: Record<NotificationType, string> = {
  success: "border-green-500/40 bg-green-500/10 text-green-400",
  error: "border-red-500/40 bg-red-500/10 text-red-400",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  info: "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan",
};

export default function NotificationBanner() {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-xl text-sm animate-[slideIn_0.2s_ease-out] ${styles[n.type]}`}
        >
          <span className="text-base font-bold shrink-0 mt-0.5">{icons[n.type]}</span>
          <span className="flex-1 break-words">{n.message}</span>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-xs"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
