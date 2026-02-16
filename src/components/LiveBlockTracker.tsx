'use client';

import { useEffect, useState, useRef } from 'react';

interface RecentBlock {
  height: number;
  timestamp: number;
  tx_count: number;
  size: number;
}

export default function LiveBlockTracker() {
  const [blocks, setBlocks] = useState<RecentBlock[]>([]);
  const [tipHeight, setTipHeight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBlocks() {
      try {
        // Get latest block height
        const tipRes = await fetch('https://mempool.space/api/blocks/tip/height');
        if (!tipRes.ok) return;
        const height = await tipRes.json();
        if (cancelled) return;
        setTipHeight(height);

        // Get recent blocks
        const blocksRes = await fetch('https://mempool.space/api/v1/blocks');
        if (!blocksRes.ok) return;
        const data = await blocksRes.json();
        if (cancelled) return;
        setBlocks(data.slice(0, 8));
      } catch {
        // silent fail
      }
    }

    fetchBlocks();
    const interval = setInterval(fetchBlocks, 30000); // refresh every 30s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function timeAgo(ts: number) {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function formatSize(bytes: number) {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${(bytes / 1_000).toFixed(0)} KB`;
  }

  if (blocks.length === 0) return null;

  return (
    <div className="mt-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs uppercase tracking-wider text-text-muted">
            Latest Blocks
          </span>
        </div>
        {tipHeight && (
          <span className="text-xs text-text-muted font-mono">
            #{tipHeight.toLocaleString()}
          </span>
        )}
      </div>

      {/* Scrollable block ticker */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {blocks.map((block) => (
          <a
            key={block.height}
            href={`/block/${block.height}`}
            className="flex-shrink-0 group"
          >
            <div className="px-3 py-2.5 rounded-lg border border-border/40 bg-bg-primary/40 hover:border-accent-orange/50 hover:bg-bg-primary/60 transition-all min-w-[120px]">
              <div className="text-sm font-mono font-bold text-accent-orange group-hover:text-accent-orange/80">
                {block.height.toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-text-muted">
                  {block.tx_count} txs
                </span>
                <span className="text-[10px] text-text-muted opacity-50">•</span>
                <span className="text-[10px] text-text-muted">
                  {formatSize(block.size)}
                </span>
              </div>
              <div className="text-[10px] text-text-muted/60 mt-0.5">
                {timeAgo(block.timestamp)}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
