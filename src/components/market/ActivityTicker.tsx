'use client';

import { useEffect, useState } from 'react';
import { formatSats } from './PriceDisplay';

interface Activity {
  type: string;
  blockHeight: number;
  price: string;
  from: string;
  to?: string;
  createdAt: string;
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ActivityTicker() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetch('/api/v1/market/activity?filter=sales&limit=20')
      .then((r) => r.json())
      .then((d) => setActivities(d.activities || []))
      .catch(() => {});

    const iv = setInterval(() => {
      fetch('/api/v1/market/activity?filter=sales&limit=20')
        .then((r) => r.json())
        .then((d) => setActivities(d.activities || []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  if (!activities.length) return null;

  return (
    <div className="w-full overflow-hidden" style={{ background: 'rgba(247,147,26,0.05)', borderTop: '1px solid rgba(247,147,26,0.15)' }}>
      <div className="flex animate-scroll-x whitespace-nowrap py-2.5 px-4 gap-8">
        {[...activities, ...activities].map((a, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-xs text-white/60">
            <span className="text-[#f7931a] font-bold">⚡ Block {a.blockHeight}</span>
            <span>sold for</span>
            <span className="text-white font-semibold">{formatSats(a.price)} sats</span>
            <span className="text-white/30">·</span>
            <span className="text-white/40">{timeAgo(a.createdAt)}</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes scroll-x {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-scroll-x {
          animation: scroll-x 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
