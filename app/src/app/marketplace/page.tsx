'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CrownShield from '@/components/CrownShield';
import BitmapBlocksBg from '@/components/BitmapBlocksBg';
import LightningPayModal from '@/components/LightningPayModal';
import { useGlobalWallet } from '@/context/GlobalWalletContext';

/* ── Types ── */
interface Listing {
  id: string;
  blockHeight: number;
  parcelTxIndex: number | null;
  tier: 2 | 3;
  spotsTotal: number; // -1 = unlimited
  spotsTaken?: number;
  price30d: number;
  price365d: number;
  active: boolean;
  welcomeMessage?: string | null;
  createdAt: string;
  owner: { walletAddress: string; handle: string | null; tier: number };
  block: { height: number; label: string | null };
}

type DurationMode = 'monthly' | 'yearly';
type SortMode = 'newest' | 'cheapest' | 'popular';

const PAGE_SIZE = 20;

/* ── Bitmap Preview (small colored Mondrian-ish div) ── */
function BitmapPreview({ blockHeight }: { blockHeight: number }) {
  // Deterministic pseudo-random from blockHeight
  const seed = blockHeight;
  const c1 = `hsl(${(seed * 37) % 360}, 80%, 55%)`;
  const c2 = `hsl(${(seed * 73) % 360}, 70%, 45%)`;
  const splitX = 30 + (seed % 40); // 30-70%
  const splitY = 25 + ((seed * 13) % 50); // 25-75%

  return (
    <div
      className="w-12 h-12 rounded-md border border-orange-500/30 overflow-hidden flex-shrink-0"
      style={{ background: '#1a1a2e' }}
    >
      <div className="w-full h-full relative">
        <div className="absolute" style={{ top: 0, left: 0, width: `${splitX}%`, height: `${splitY}%`, background: '#f59e0b' }} />
        <div className="absolute" style={{ top: 0, left: `${splitX}%`, width: `${100 - splitX}%`, height: `${splitY}%`, background: c1 }} />
        <div className="absolute" style={{ top: `${splitY}%`, left: 0, width: `${splitX}%`, height: `${100 - splitY}%`, background: c2 }} />
        <div className="absolute" style={{ top: `${splitY}%`, left: `${splitX}%`, width: `${100 - splitX}%`, height: `${100 - splitY}%`, background: '#f97316' }} />
      </div>
    </div>
  );
}

/* ── Listing Card ── */
function ListingCard({ listing, onPay }: { listing: Listing; onPay: (listing: Listing, duration: DurationMode) => void }) {
  const monthly = listing.price30d;
  const yearly = listing.price365d;
  const savePct = monthly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;
  const spotsRemaining = listing.spotsTotal === -1
    ? null
    : listing.spotsTotal - (listing.spotsTaken || 0);
  const isUnlimited = listing.spotsTotal === -1;
  const tierLabel = listing.tier === 2 ? 'Tier 2 Parcel' : 'Tier 3 Delegation';
  const tierColor = listing.tier === 2 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20';

  return (
    <div className="group relative bg-[#12121f]/80 backdrop-blur border border-orange-500/10 rounded-xl p-5 transition-all duration-300 hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 hover:-translate-y-0.5">
      {/* Top: Block preview + info */}
      <div className="flex items-start gap-3 mb-3">
        <BitmapPreview blockHeight={listing.blockHeight} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white font-mono">
              Block #{listing.blockHeight.toLocaleString()}
            </h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${tierColor}`}>
              {tierLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <CrownShield tier={listing.owner.tier as 1 | 2 | 3} size={18} />
            {listing.owner.handle ? (
              <Link href={`/agent/${listing.owner.handle}`} className="text-xs text-gray-400 truncate hover:text-orange-400 transition-colors">
                @{listing.owner.handle}
              </Link>
            ) : (
              <span className="text-xs text-gray-400 truncate">
                {listing.owner.walletAddress.slice(0, 12)}...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Welcome message */}
      {listing.welcomeMessage && (
        <p className="text-[11px] text-gray-500 italic mb-3 line-clamp-2">
          &quot;{listing.welcomeMessage}&quot;
        </p>
      )}

      {/* Pricing */}
      <div className="flex items-baseline gap-3 mb-3">
        <div>
          <span className="text-lg font-bold text-orange-400 font-mono">{monthly.toLocaleString()}</span>
          <span className="text-xs text-gray-500 ml-1">sats/mo</span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="font-mono">{yearly.toLocaleString()}</span> sats/yr
          {savePct > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
              SAVE {savePct}%
            </span>
          )}
        </div>
      </div>

      {/* Spots */}
      <div className="flex items-center justify-between mb-4 text-xs text-gray-400">
        <span>
          {isUnlimited ? '∞ Unlimited spots' : `${spotsRemaining} remaining`}
        </span>
      </div>

      {/* CTA */}
      <div className="flex gap-2">
        <Link
          href={`/nexus/parcel/${listing.blockHeight}`}
          className="flex-1 text-center py-2.5 rounded-lg text-sm font-semibold bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/50 transition-all"
        >
          🟧 View Block
        </Link>
        <button
          onClick={() => onPay(listing, 'monthly')}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/40 text-orange-300 hover:brightness-125 transition-all cursor-pointer"
        >
          ⚡ Pay Lightning
        </button>
      </div>
    </div>
  );
}

/* ── Smart Purchase Gate ── */
type GateResult =
  | { action: 'allow' }
  | { action: 'connect_wallet' }
  | { action: 'owns_this_block'; blockHeight: number }
  | { action: 'already_tier1'; ownedBlock: number; suggestion: 'tier2' }
  | { action: 'already_tier2_same_block'; blockHeight: number }
  | { action: 'allow_cross_block' }; // Tier 1/2 buying on a DIFFERENT block — allowed

function evaluatePurchaseGate(
  listing: Listing,
  isConnected: boolean,
  walletAddress: string | null,
  profile: { tier?: number; blockHeight?: number } | null,
): GateResult {
  if (!isConnected || !walletAddress) return { action: 'connect_wallet' };
  // Owner trying to buy on their own block
  if (listing.owner.walletAddress === walletAddress) return { action: 'owns_this_block', blockHeight: listing.blockHeight };
  // Tier 1 block owner — suggest Tier 2 instead
  if (profile?.tier === 1 && listing.blockHeight === profile.blockHeight) return { action: 'already_tier2_same_block', blockHeight: listing.blockHeight };
  // Tier 1 buying on a different block — that's fine, cross-block expansion
  if (profile?.tier === 1) return { action: 'allow_cross_block' };
  // Tier 2 on the same block — already have parcel access
  if (profile?.tier === 2 && listing.blockHeight === profile.blockHeight) return { action: 'already_tier2_same_block', blockHeight: listing.blockHeight };
  // All other cases — allow purchase
  return { action: 'allow' };
}

/* ── Gate Message Modal ── */
function GateModal({ gate, listing, onClose }: { gate: GateResult; listing: Listing; onClose: () => void }) {
  const content = (() => {
    switch (gate.action) {
      case 'connect_wallet':
        return {
          icon: '🔗', title: 'Connect Your Wallet',
          msg: 'You need to connect your wallet before purchasing a delegation.',
          btnText: '🔗 Connect Wallet',
          btnAction: () => { window.dispatchEvent(new Event('open-wallet-modal')); onClose(); },
        };
      case 'owns_this_block':
        return {
          icon: '👑', title: 'You Own This Block!',
          msg: `You already own Block #${gate.blockHeight.toLocaleString()}. You have full Tier 1 sovereignty — no delegation needed!`,
          btnText: '🗺️ Visit Your Block',
          btnHref: `/nexus/parcel/${gate.blockHeight}`,
        };
      case 'already_tier1':
        return {
          icon: '⬆️', title: 'Upgrade Available',
          msg: `As a Tier 1 block owner (Block #${gate.ownedBlock.toLocaleString()}), a Tier 3 delegation would be a downgrade. Consider purchasing Tier 2 parcel access for expanded rights on Block #${listing.blockHeight.toLocaleString()}.`,
          btnText: '🟧 View Block',
          btnHref: `/nexus/parcel/${listing.blockHeight}`,
        };
      case 'already_tier2_same_block':
        return {
          icon: '✅', title: 'You Already Have Access',
          msg: `You already have parcel access on Block #${gate.blockHeight.toLocaleString()}. No additional delegation needed!`,
          btnText: '🗺️ Visit Block',
          btnHref: `/nexus/parcel/${gate.blockHeight}`,
        };
      default:
        return null;
    }
  })();
  if (!content) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a2e] border border-orange-500/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="text-center">
          <div className="text-5xl mb-4">{content.icon}</div>
          <h3 className="text-lg font-bold text-white mb-2">{content.title}</h3>
          <p className="text-sm text-gray-400 mb-6">{content.msg}</p>
          {'btnHref' in content && content.btnHref ? (
            <Link href={content.btnHref} className="inline-block w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:brightness-110 transition-all text-center">
              {content.btnText}
            </Link>
          ) : content.btnAction ? (
            <button onClick={content.btnAction} className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:brightness-110 transition-all cursor-pointer">
              {content.btnText}
            </button>
          ) : null}
          <button onClick={onClose} className="mt-3 text-xs text-gray-500 hover:text-gray-300 cursor-pointer">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function MarketplacePage() {
  const globalWallet = useGlobalWallet();
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Purchase gate
  const [gateResult, setGateResult] = useState<GateResult | null>(null);
  const [gateListing, setGateListing] = useState<Listing | null>(null);

  // Filters
  const [payListing, setPayListing] = useState<Listing | null>(null);
  const [payDuration, setPayDuration] = useState<DurationMode>('monthly');
  const [showPayModal, setShowPayModal] = useState(false);
  const [search, setSearch] = useState('');
  const [duration, setDuration] = useState<DurationMode>('monthly');
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const fetchListings = useCallback(async (newOffset: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const resp = await fetch(`/api/v1/delegations/listings?active=true&limit=${PAGE_SIZE}&offset=${newOffset}`);
      if (!resp.ok) throw new Error('Failed to fetch');
      const json = await resp.json();
      const data = json?.data || json;
      const items: Listing[] = data.listings || [];
      setTotal(data.total || 0);
      setOffset(newOffset);
      setListings(prev => append ? [...prev, ...items] : items);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchListings(0, false); }, [fetchListings]);

  const filtered = useMemo(() => {
    let items = [...listings];

    // Search by block #
    if (search.trim()) {
      const q = search.trim();
      items = items.filter(l =>
        l.blockHeight.toString().includes(q) ||
        (l.owner.handle && l.owner.handle.toLowerCase().includes(q.toLowerCase()))
      );
    }

    // Price filter
    const priceKey = duration === 'monthly' ? 'price30d' : 'price365d';
    if (minPrice) items = items.filter(l => l[priceKey] >= parseInt(minPrice, 10));
    if (maxPrice) items = items.filter(l => l[priceKey] <= parseInt(maxPrice, 10));

    // Sort
    if (sortBy === 'newest') items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === 'cheapest') items.sort((a, b) => a[priceKey] - b[priceKey]);
    else if (sortBy === 'popular') items.sort((a, b) => (b.spotsTaken || 0) - (a.spotsTaken || 0));

    return items;
  }, [listings, search, duration, sortBy, minPrice, maxPrice]);

  const hasMore = offset + PAGE_SIZE < total;

  return (
    <div className="min-h-screen bg-[#0a0a12] relative">
      <div className="opacity-50">
        <BitmapBlocksBg />
      </div>

      {/* Hero */}
      <div className="relative border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 relative">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                🏷️ Delegation Marketplace
              </span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base">
              Browse available blocks and parcels for rent
            </p>
            <div className="flex items-center justify-center gap-6 mt-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-orange-400">{total}</span>
                <span className="text-gray-500">Active Listings</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar (sticky) */}
      <div className="sticky top-16 z-40 bg-[#0a0a12]/90 backdrop-blur-xl border-b border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-500">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by block # or owner..."
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-all"
              />
            </div>

            {/* Price range */}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder="Min sats"
                className="w-24 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500/50"
              />
              <span className="text-gray-600 text-xs">–</span>
              <input
                type="number"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder="Max sats"
                className="w-24 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>

            {/* Duration toggle */}
            <div className="flex bg-white/5 rounded-lg border border-white/10 p-0.5">
              {(['monthly', 'yearly'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    duration === d ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {d === 'monthly' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortMode)}
              className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-400 focus:outline-none focus:border-orange-500/50"
            >
              <option value="newest">Newest</option>
              <option value="cheapest">Cheapest</option>
              <option value="popular">Most Popular</option>
            </select>

            <span className="text-xs text-gray-600 ml-auto hidden sm:inline">
              {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 relative">
        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3 animate-pulse">🟧</div>
            <p className="text-gray-500 text-sm">Loading listings...</p>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(listing => (
                <ListingCard key={listing.id} listing={listing} onPay={(l, d) => {
                  const gate = evaluatePurchaseGate(
                    l,
                    globalWallet.isConnected,
                    globalWallet.walletAddress,
                    globalWallet.profile ? { tier: globalWallet.profile.tier, blockHeight: globalWallet.profile.anchorBlock } : null,
                  );
                  if (gate.action === 'allow' || gate.action === 'allow_cross_block') {
                    setPayListing(l); setPayDuration(d); setShowPayModal(true);
                  } else {
                    setGateListing(l); setGateResult(gate);
                  }
                }} />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchListings(offset + PAGE_SIZE, true)}
                  disabled={loadingMore}
                  className="px-8 py-3 rounded-xl text-sm font-semibold bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏷️</div>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No listings yet</h3>
            <p className="text-sm text-gray-500 mb-6">
              Block owners can list their blocks from the Nexus map.
            </p>
            <Link
              href="/nexus"
              className="inline-block px-6 py-2.5 rounded-xl text-sm font-semibold bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all"
            >
              ⚡ Explore the Nexus
            </Link>
          </div>
        )}
      </div>

      {/* Smart Purchase Gate Modal */}
      {gateResult && gateListing && gateResult.action !== 'allow' && gateResult.action !== 'allow_cross_block' && (
        <GateModal gate={gateResult} listing={gateListing} onClose={() => { setGateResult(null); setGateListing(null); }} />
      )}

      {/* Lightning Payment Modal */}
      {showPayModal && payListing && (
        <LightningPayModal
          amountUsd={
            payDuration === 'monthly'
              ? (payListing.price30d / 100000000 * 100000).toFixed(2) // sats to approximate USD — will use real rate from Strike
              : (payListing.price365d / 100000000 * 100000).toFixed(2)
          }
          description={`${payDuration === 'monthly' ? '30-day' : '365-day'} delegation — Block #${payListing.blockHeight.toLocaleString()}`}
          correlationId={`deleg-${payListing.id}-${payDuration}-${Date.now()}`}
          onPaid={(invoiceId) => {
            setShowPayModal(false);
            setPayListing(null);
            // TODO: activate delegation in DB after payment confirmed
          }}
          onClose={() => { setShowPayModal(false); setPayListing(null); }}
        />
      )}
    </div>
  );
}
