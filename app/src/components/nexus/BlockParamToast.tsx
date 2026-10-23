"use client";

import { useEffect, useState } from "react";
import { parseBlockParam } from "@/lib/blockDeepLink";

/**
 * The note for a `?block=` value that names no block, or null when there is
 * nothing to say (no param, or a valid height). Long junk is shortened so the
 * toast stays one line.
 */
export function blockParamNotice(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  if (parseBlockParam(raw) !== undefined) return null;
  const shown = raw.trim().length > 24 ? `${raw.trim().slice(0, 24)}…` : raw.trim();
  return `Block ${shown} not found`;
}

/**
 * /nexus?block=abc used to discard the bad value silently and show the map. Say
 * so once, then get out of the way: the map is already the fallback.
 */
export default function BlockParamToast({ raw, ms = 4000 }: { raw: string | null; ms?: number }) {
  // Latched on first render: the map rewrites the URL (removing the bad value)
  // as soon as it mounts, and the note must outlive that.
  const [message] = useState(() => blockParamNotice(raw));
  const [visible, setVisible] = useState(message !== null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(t);
  }, [message, ms]);

  if (!message || !visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-mono"
      style={{
        background: "rgba(18,18,26,0.92)",
        border: "1px solid rgba(248,113,113,0.35)",
        color: "#fca5a5",
        backdropFilter: "blur(8px)",
      }}
    >
      {message}
    </div>
  );
}
