'use client';

import { useEffect, useState } from 'react';
import { getEpoch, getEpochColor } from './NexusBlockData';

export default function NexusStatsBar() {
  const [tipHeight, setTipHeight] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTip() {
      try {
        const res = await fetch('https://mempool.space/api/blocks/tip/height');
        if (res.ok) {
          const h = await res.json();
          if (!cancelled) setTipHeight(h);
        }
      } catch { /* silent */ }
    }
    fetchTip();
    const iv = setInterval(fetchTip, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const totalBlocks = tipHeight ?? 880000;
  const currentEpoch = getEpoch(totalBlocks - 1);
  const claimedPct = 30; // TODO: fetch real claimed % when available

  const stats = [
    { label: 'Total Blocks', value: totalBlocks.toLocaleString() },
    { label: 'Claimed Bitmaps', value: `${claimedPct}%` },
    { label: 'Current Epoch', value: `${currentEpoch}`, color: getEpochColor(currentEpoch) },
    { label: 'Latest Block', value: `#${(totalBlocks - 1).toLocaleString()}` },
  ];

  return (
    <div className="flex items-center gap-6 px-4 py-2 text-xs font-mono" style={{ background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(102,204,255,0.1)' }}>
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="text-[#64748b]">{s.label}:</span>
          <span style={{ color: s.color ?? '#e2e8f0' }} className="font-semibold">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
