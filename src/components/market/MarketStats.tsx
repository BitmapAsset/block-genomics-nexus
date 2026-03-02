'use client';

import { useEffect, useState } from 'react';
import { formatSats, satsToUsd } from './PriceDisplay';

interface Stats {
  totalListings: number;
  floorPrice: string;
  totalVolume: string;
  volume24h: string;
  totalSales: number;
}

export default function MarketStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/v1/market/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const items = [
    { label: 'Floor Price', value: stats ? `${formatSats(stats.floorPrice)} sats` : '—', sub: stats ? satsToUsd(stats.floorPrice) : '' },
    { label: '24h Volume', value: stats ? `${formatSats(stats.volume24h)} sats` : '—', sub: stats ? satsToUsd(stats.volume24h) : '' },
    { label: 'Listed', value: stats ? stats.totalListings.toLocaleString() : '—', sub: 'bitmaps' },
    { label: 'Total Sales', value: stats ? stats.totalSales.toLocaleString() : '—', sub: 'all time' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-xl p-4 text-center"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{item.label}</div>
          <div className="text-xl font-bold text-white">{item.value}</div>
          <div className="text-xs text-white/30 mt-0.5">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}
