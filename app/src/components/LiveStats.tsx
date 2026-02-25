'use client';

import { useEffect, useState } from 'react';

interface Stats {
  blockHeight: number | null;
  verifiedAgents: number | null;
  genomesMinted: number | null;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K+`;
  return n.toLocaleString();
}

export default function LiveStats() {
  const [stats, setStats] = useState<Stats>({
    blockHeight: null,
    verifiedAgents: null,
    genomesMinted: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      // Block height from mempool
      try {
        const res = await fetch('https://mempool.space/api/blocks/tip/height');
        if (res.ok) {
          const h = await res.json();
          if (!cancelled) setStats(s => ({ ...s, blockHeight: h }));
        }
      } catch { /* silent */ }

      // Verified agents + genomes from our API
      try {
        const res = await fetch('/api/v1/stats');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStats(s => ({
            ...s,
            verifiedAgents: data.verifiedAgents ?? 0,
            genomesMinted: data.genomesMinted ?? 0,
          }));
        }
      } catch { /* silent */ }
    }

    fetchAll();
    const iv = setInterval(fetchAll, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const items = [
    {
      icon: '⛓️',
      value: stats.blockHeight ? formatNum(stats.blockHeight) : '880K+',
      label: 'Blocks with DNA',
    },
    {
      icon: '🤖',
      value: stats.verifiedAgents !== null ? (stats.verifiedAgents > 0 ? formatNum(stats.verifiedAgents) : '0') : '—',
      label: 'Verified Agents',
    },
    {
      icon: '🧬',
      value: stats.genomesMinted !== null ? (stats.genomesMinted > 0 ? formatNum(stats.genomesMinted) : '0') : '—',
      label: 'Genomes Minted',
    },
  ];

  return (
    <div className="mt-16 mb-20 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
      {items.map((stat) => (
        <div
          key={stat.label}
          className="glass-panel p-5 text-center backdrop-blur-md bg-bg-secondary/50 hover:glass-panel-hover transition-all"
        >
          <div className="text-2xl mb-2">{stat.icon}</div>
          <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
          <div className="text-xs text-text-muted mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
