'use client';

const EPOCHS: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Genesis', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  2: { label: 'Growth', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
  3: { label: 'Mainstream', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)' },
  4: { label: 'Institutional', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
  5: { label: 'Post-Halving', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
};

export function getEpoch(height: number): number {
  if (height < 210000) return 1;
  if (height < 420000) return 2;
  if (height < 630000) return 3;
  if (height < 840000) return 4;
  return 5;
}

export function getEpochInfo(height: number) {
  return EPOCHS[getEpoch(height)];
}

export default function EpochBadge({ height, className = '' }: { height: number; className?: string }) {
  const epoch = getEpoch(height);
  const info = EPOCHS[epoch];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${className}`}
      style={{
        color: info.color,
        background: info.bg,
        border: `1px solid ${info.border}`,
        textShadow: `0 0 8px ${info.color}40`,
      }}
    >
      E{epoch} · {info.label}
    </span>
  );
}
