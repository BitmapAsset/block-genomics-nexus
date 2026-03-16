'use client';

import { useEffect, useState } from 'react';
import { useBlockHeight } from '@/hooks/useBlockHeight';

interface ApiStats {
  verifiedAgents: number | null;
  genomesMinted: number | null;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K+`;
  return n.toLocaleString();
}

export default function LiveStats() {
  const blockHeight = useBlockHeight(60_000);
  const [stats, setStats] = useState<ApiStats>({
    verifiedAgents: null,
    genomesMinted: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchApiStats() {
      try {
        const res = await fetch('/api/v1/stats');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStats({
            verifiedAgents: data.verifiedAgents ?? 0,
            genomesMinted: data.genomesMinted ?? 0,
          });
        }
      } catch { /* silent */ }
    }

    fetchApiStats();
    const iv = setInterval(fetchApiStats, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const items = [
    {
      icon: '⛓️',
      value: blockHeight ? formatNum(blockHeight) : '880K+',
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
