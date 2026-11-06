"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const pill =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line-2 px-5 text-sm font-medium text-text-1 transition-colors hover:bg-surface-3";

export default function CopyButton({
  text,
  label = "Copy",
  className = pill,
  iconOnly = false,
}: {
  text: string;
  label?: string;
  className?: string;
  /** A 44 px square button with the label for screen readers only. */
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // A root-relative path is useless in a paste, so resolve it against the
      // current origin — also correct on preview deploys and locally.
      const value = text.startsWith('/')
        ? new URL(text, window.location.origin).toString()
        : text;
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      title={`Copy ${label}`}
      aria-label={iconOnly ? `Copy ${label}` : undefined}
    >
      {copied ? (
        <>
          <Check size={16} strokeWidth={1.75} className="text-ok-text" aria-hidden="true" />
          {iconOnly ? null : "Copied"}
        </>
      ) : (
        <>
          <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
          {iconOnly ? null : `Copy ${label}`}
        </>
      )}
    </button>
  );
}
