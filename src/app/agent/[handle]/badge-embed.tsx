"use client";

import { useState } from "react";

export default function BadgeEmbed({
  agentId,
  agentName,
  apiUrl,
}: {
  agentId: string;
  agentName: string;
  apiUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const embedCode = `<a href="${typeof window !== 'undefined' ? window.location.origin : ''}/agent/${agentId}"><img src="${apiUrl}/api/v1/badge/${agentId}.svg" alt="${agentName} — Block Genomics Verified" width="200" height="200" /></a>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div>
      <div className="relative">
        <pre className="bg-bg-primary/60 rounded-xl border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {embedCode}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 rounded-md bg-bg-tertiary/80 border border-border px-2.5 py-1 text-xs text-text-muted hover:text-accent-cyan hover:border-accent-cyan/30 transition-colors"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
