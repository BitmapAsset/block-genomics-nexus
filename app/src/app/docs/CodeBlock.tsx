'use client';

import { useState } from 'react';

interface CodeBlockProps {
  code: string;
  lang?: string;
  title?: string;
}

/** A dark, copy-to-clipboard code panel matching the site aesthetic. */
export default function CodeBlock({ code, lang = 'bash', title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op; the code is still selectable */
    }
  };

  return (
    <div
      className="my-4 overflow-hidden rounded-xl"
      style={{ background: '#0c0c14', border: '1px solid var(--color-border)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}
      >
        <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {title ?? lang}
        </span>
        <button
          onClick={copy}
          className="rounded-md px-2 py-1 text-xs font-medium transition-all"
          style={{
            background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(102,204,255,0.08)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.35)' : 'rgba(102,204,255,0.2)'}`,
            color: copied ? '#4ade80' : '#66ccff',
          }}
          aria-label="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5" style={{ margin: 0 }}>
        <code
          className="font-mono"
          style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#d7e3f4', whiteSpace: 'pre' }}
        >
          {code}
        </code>
      </pre>
    </div>
  );
}
