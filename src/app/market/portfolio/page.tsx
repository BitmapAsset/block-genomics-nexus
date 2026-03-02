'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import BitmapThumbnail from '@/components/BitmapThumbnail';
import EpochBadge from '@/components/market/EpochBadge';
import { formatSats, satsToUsd } from '@/components/market/PriceDisplay';
import ListModal from '@/components/market/ListModal';

type Tab = 'listings' | 'offers' | 'purchases';

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function PortfolioPage() {
  const { walletAddress } = useGlobalWallet();
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listBlock, setListBlock] = useState<number | null>(null);

  useEffect(() => {
    if (!walletAddress) { setLoading(false); return; }
    setLoading(true);

    Promise.all([
      fetch(`/api/v1/market/listings?sellerAddress=${walletAddress}&status=active`).then(r => r.json()).catch(() => ({ listings: [] })),
      fetch(`/api/v1/market/offers?offererAddress=${walletAddress}`).then(r => r.json()).catch(() => ({ offers: [] })),
    ]).then(([l, o]) => {
      setListings(l.listings || []);
      setOffers(o.offers || []);
    }).finally(() => setLoading(false));
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a12' }}>
        <div className="text-center">
          <div className="text-5xl mb-4">🔐</div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-white/40">Connect to view your marketplace portfolio</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'listings', label: 'My Listings', count: listings.length },
    { id: 'offers', label: 'My Offers', count: offers.length },
    { id: 'purchases', label: 'Purchases', count: 0 },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a0a12' }}>
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="mb-8">
          <Link href="/market" className="text-sm text-white/40 hover:text-white/60 transition-colors">
            ← Back to Marketplace
          </Link>
          <h1 className="text-3xl font-black text-white mt-4">My Portfolio</h1>
        </div>

        <div className="flex gap-2 mb-8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id ? 'text-white' : 'text-white/40 hover:text-white/60'
              }`}
              style={tab === t.id ? { background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.3)' } : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#f7931a]/30 border-t-[#f7931a] rounded-full animate-spin" />
          </div>
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <div className="text-center py-20 text-white/30">No active listings</div>
          ) : (
            <div className="space-y-3">
              {listings.map((l: any) => (
                <div
                  key={l.id}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <BitmapThumbnail blockHeight={l.blockHeight} size={48} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">#{l.blockHeight.toLocaleString()}</span>
                      <EpochBadge height={l.blockHeight} />
                      <span className={`text-xs px-2 py-0.5 rounded-full ${l.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
                        {l.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#f7931a]">{formatSats(l.price)} sats</div>
                    <div className="text-xs text-white/30">{timeAgo(l.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'offers' ? (
          offers.length === 0 ? (
            <div className="text-center py-20 text-white/30">No pending offers</div>
          ) : (
            <div className="space-y-3">
              {offers.map((o: any) => (
                <div
                  key={o.id}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <BitmapThumbnail blockHeight={o.blockHeight} size={48} />
                  </div>
                  <div className="flex-1">
                    <span className="font-bold text-white">#{o.blockHeight.toLocaleString()}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${o.status === 'pending' ? 'bg-blue-500/15 text-blue-400' : o.status === 'accepted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#60a5fa]">{formatSats(o.amount)} sats</div>
                    <div className="text-xs text-white/30">{timeAgo(o.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-20 text-white/30">Purchase history coming soon</div>
        )}
      </div>

      {listBlock !== null && (
        <ListModal blockHeight={listBlock} walletAddress={walletAddress} onClose={() => setListBlock(null)} />
      )}
    </div>
  );
}
