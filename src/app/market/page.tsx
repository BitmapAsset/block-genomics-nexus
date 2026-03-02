'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import BitmapCard from '@/components/market/BitmapCard';
import MarketStats from '@/components/market/MarketStats';
import ActivityTicker from '@/components/market/ActivityTicker';
import EpochBadge, { getEpochInfo } from '@/components/market/EpochBadge';

interface Listing {
  id: string;
  blockHeight: number;
  price: string;
  status: string;
  seller: { walletAddress: string; handle?: string | null; tier?: number; verified?: boolean };
}

type SortMode = 'newest' | 'price_asc' | 'price_desc' | 'block_asc' | 'block_desc';

const EPOCHS = [
  { id: 1, label: 'Genesis (0–209,999)', color: '#fbbf24' },
  { id: 2, label: 'Growth (210k–419,999)', color: '#34d399' },
  { id: 3, label: 'Mainstream (420k–629,999)', color: '#60a5fa' },
  { id: 4, label: 'Institutional (630k–839,999)', color: '#a78bfa' },
  { id: 5, label: 'Post-Halving (840k+)', color: '#f97316' },
];

export default function MarketPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortMode>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedEpochs, setSelectedEpochs] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchListings = useCallback(async (p: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '24', sort });
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if (selectedEpochs.length) params.set('epoch', selectedEpochs.join(','));

      const res = await fetch(`/api/v1/market/listings?${params}`);
      const data = await res.json();
      setListings(prev => append ? [...prev, ...data.listings] : data.listings);
      setTotalPages(data.pages);
      setPage(p);
    } catch (e) {
      console.error('Failed to fetch listings:', e);
    } finally {
      setLoading(false);
    }
  }, [sort, minPrice, maxPrice, selectedEpochs]);

  useEffect(() => {
    fetchListings(1);
  }, [fetchListings]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && page < totalPages) {
        fetchListings(page + 1, true);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [page, totalPages, loading, fetchListings]);

  const toggleEpoch = (id: number) => {
    setSelectedEpochs(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  return (
    <div className="min-h-screen" style={{ background: '#0a0a12' }}>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(247,147,26,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 pt-24 pb-12">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-6xl font-black text-white mb-3">
              The Bitmap <span style={{ color: '#f7931a', textShadow: '0 0 30px rgba(247,147,26,0.4)' }}>Marketplace</span>
            </h1>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              Trade Bitcoin blocks. Own the blockchain. Build the metaverse.
            </p>
          </div>
          <MarketStats />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {showFilters ? '✕ Hide Filters' : '☰ Filters'}
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="px-4 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-white focus:outline-none"
          >
            <option value="newest">Recently Listed</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="block_asc">Block Height ↑</option>
            <option value="block_desc">Block Height ↓</option>
          </select>
        </div>

        <div className="flex gap-6">
          {/* Filters sidebar */}
          {showFilters && (
            <div
              className="w-64 shrink-0 rounded-2xl p-5 space-y-6 self-start sticky top-20 hidden md:block"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div>
                <h4 className="text-xs uppercase tracking-widest text-white/40 mb-3">Price Range (sats)</h4>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <h4 className="text-xs uppercase tracking-widest text-white/40 mb-3">Epoch</h4>
                <div className="space-y-2">
                  {EPOCHS.map((ep) => (
                    <label key={ep.id} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedEpochs.includes(ep.id)}
                        onChange={() => toggleEpoch(ep.id)}
                        className="sr-only"
                      />
                      <div
                        className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                        style={{
                          borderColor: selectedEpochs.includes(ep.id) ? ep.color : 'rgba(255,255,255,0.2)',
                          background: selectedEpochs.includes(ep.id) ? `${ep.color}30` : 'transparent',
                        }}
                      >
                        {selectedEpochs.includes(ep.id) && (
                          <div className="w-2 h-2 rounded-sm" style={{ background: ep.color }} />
                        )}
                      </div>
                      <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                        {ep.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { setMinPrice(''); setMaxPrice(''); setSelectedEpochs([]); }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Grid */}
          <div className="flex-1">
            {listings.length === 0 && !loading ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🏜️</div>
                <h3 className="text-xl font-bold text-white/60 mb-2">No listings yet</h3>
                <p className="text-white/30">Be the first to list your bitmap for sale!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {listings.map((listing) => (
                  <BitmapCard
                    key={listing.id}
                    blockHeight={listing.blockHeight}
                    price={listing.price}
                    seller={listing.seller}
                    status={listing.status}
                  />
                ))}
              </div>
            )}

            {/* Loading / Infinite scroll sentinel */}
            {loading && (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-[#f7931a]/30 border-t-[#f7931a] rounded-full animate-spin" />
              </div>
            )}
            <div ref={sentinelRef} className="h-4" />
          </div>
        </div>
      </div>

      {/* Activity ticker */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <ActivityTicker />
      </div>
    </div>
  );
}
