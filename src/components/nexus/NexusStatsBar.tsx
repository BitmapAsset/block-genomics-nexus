'use client';

import { TOTAL_BLOCKS, getEpoch, getEpochColor } from './NexusBlockData';

export default function NexusStatsBar() {
  const currentEpoch = getEpoch(TOTAL_BLOCKS - 1);
  const claimedPct = 30;

  const stats = [
    { label: 'Total Blocks', value: TOTAL_BLOCKS.toLocaleString() },
    { label: 'Claimed Bitmaps', value: `${claimedPct}%` },
    { label: 'Current Epoch', value: `${currentEpoch}`, color: getEpochColor(currentEpoch) },
    { label: 'Latest Block', value: `#${(TOTAL_BLOCKS - 1).toLocaleString()}` },
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
