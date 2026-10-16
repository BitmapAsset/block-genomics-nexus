"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
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
      onClick={handleCopy}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <span className="text-success">✓</span> Copied
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy {label}
        </>
      )}
    </button>
  );
}
