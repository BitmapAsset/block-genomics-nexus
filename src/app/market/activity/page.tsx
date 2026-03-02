'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BitmapThumbnail from '@/components/BitmapThumbnail';
import EpochBadge from '@/components/market/EpochBadge';
import { formatSats, satsToUsd } from '@/components/market/PriceDisplay';

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

const TYPE_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  sale: { label: 'Sale', color: '#34d399', icon: '💰' },
  listing: { label: 'Listed', color: '#f7931a', icon: '📋' },
  offer: { label: 'Offer', color: '#60a5fa', icon: '🤝' },
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/market/activity?filter=${filter}&limit=100`)
      .then((r) => r.json())
      .then((d) => setActivities(d.activities || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="min-h-screen" style={{ background: '#0a0a12' }}>
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="mb-8">
          <Link href="/market" className="text-sm text-white/40 hover:text-white/60 transition-colors">
            ← Back to Marketplace
          </Link>
          <h1 className="text-3xl font-black text-white mt-4">Activity Feed</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-8">
          {['all', 'sales', 'listings', 'offers'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === f ? 'text-white' : 'text-white/40 hover:text-white/60'
              }`}
              style={filter === f ? { background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.3)' } : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#f7931a]/30 border-t-[#f7931a] rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-20 text-white/30">No activity yet</div>
        ) : (
          <div className="space-y-3">
            {activities.map((a, i) => {
              const style = TYPE_STYLES[a.type] || TYPE_STYLES.sale;
              return (
                <Link
                  key={i}
                  href={`/market/${a.blockHeight}`}
                  className="flex items-center gap-4 p-4 rounded-xl transition-all hover:-translate-y-0.5 group"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <BitmapThumbnail blockHeight={a.blockHeight} size={48} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{style.icon}</span>
                      <span className="font-bold text-white">#{a.blockHeight.toLocaleString()}</span>
                      <EpochBadge height={a.blockHeight} />
                    </div>
                    <div className="text-xs text-white/40 mt-0.5 truncate">
                      {a.type === 'sale' ? `${a.from.slice(0, 8)}... → ${a.to?.slice(0, 8)}...` : `by ${a.from.slice(0, 8)}...`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold" style={{ color: style.color }}>
                      {formatSats(a.price)} sats
                    </div>
                    <div className="text-xs text-white/30">{timeAgo(a.createdAt)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
