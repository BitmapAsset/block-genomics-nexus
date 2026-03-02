'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BitmapThumbnail from '@/components/BitmapThumbnail';
import CrownShield from '@/components/CrownShield';
import EpochBadge, { getEpoch, getEpochInfo } from '@/components/market/EpochBadge';
import PriceDisplay, { formatSats, satsToUsd } from '@/components/market/PriceDisplay';
import PriceChart from '@/components/market/PriceChart';
import OfferModal from '@/components/market/OfferModal';
import { useGlobalWallet } from '@/context/GlobalWalletContext';

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BlockMarketPage() {
  const params = useParams();
  const height = parseInt(params.height as string);
  const { walletAddress } = useGlobalWallet();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOffer, setShowOffer] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/market/block/${height}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [height]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a12' }}>
        <div className="w-10 h-10 border-2 border-[#f7931a]/30 border-t-[#f7931a] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50" style={{ background: '#0a0a12' }}>
        Block not found
      </div>
    );
  }

  const { listing, offers, sales, block, guardian, hasWorldBuilt, worldObjectCount } = data;
  const owner = block?.owner;
  const epochInfo = getEpochInfo(height);

  return (
    <div className="min-h-screen" style={{ background: '#0a0a12' }}>
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-20">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/market" className="text-sm text-white/40 hover:text-white/60 transition-colors">
            ← Back to Marketplace
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Visualization */}
          <div>
            <div
              className="relative rounded-2xl overflow-hidden aspect-square flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <BitmapThumbnail blockHeight={height} size={400} />
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <EpochBadge height={height} />
                {hasWorldBuilt && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    🏗️ {worldObjectCount} World Objects
                  </span>
                )}
                {guardian && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    🤖 Guardian: {guardian.name}
                  </span>
                )}
              </div>
            </div>

            {/* Nexus link */}
            <Link
              href={`/nexus/parcel/${height}`}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5"
              style={{
                color: '#00ffcc',
                background: 'rgba(0,255,204,0.08)',
                border: '1px solid rgba(0,255,204,0.25)',
                boxShadow: '0 0 15px rgba(0,255,204,0.1)',
              }}
            >
              ⚡ View in Nexus
            </Link>
          </div>

          {/* Right: Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">
                Block #{height.toLocaleString()}
              </h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-white/40">
                <span>Epoch {getEpoch(height)}</span>
                <span>·</span>
                <span style={{ color: epochInfo.color }}>{epochInfo.label}</span>
              </div>
            </div>

            {/* Owner */}
            {owner && (
              <div
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {owner.verified && <CrownShield tier={(owner.tier as 1 | 2 | 3) || 3} size={32} verified />}
                <div>
                  <div className="text-xs text-white/40">Owner</div>
                  <div className="text-sm font-medium text-white">
                    {owner.handle ? `@${owner.handle}` : `${owner.walletAddress.slice(0, 12)}...`}
                  </div>
                </div>
              </div>
            )}

            {/* Price / Buy */}
            {listing ? (
              <div
                className="p-6 rounded-2xl space-y-4"
                style={{
                  background: 'rgba(247,147,26,0.05)',
                  border: '1px solid rgba(247,147,26,0.15)',
                }}
              >
                <div className="text-xs uppercase tracking-widest text-white/40">Current Price</div>
                <PriceDisplay sats={listing.price} size="lg" />
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-3.5 rounded-xl font-bold text-white transition-all hover:shadow-[0_0_25px_rgba(247,147,26,0.4)]"
                    style={{ background: 'linear-gradient(135deg, #f7931a, #e2761b)' }}
                  >
                    Buy Now
                  </button>
                  <button
                    onClick={() => setShowOffer(true)}
                    className="flex-1 py-3.5 rounded-xl font-bold text-[#f7931a] transition-all hover:bg-[#f7931a]/10"
                    style={{ border: '1px solid rgba(247,147,26,0.3)' }}
                  >
                    Make Offer
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="p-6 rounded-2xl text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="text-white/50 mb-3">Not currently listed</div>
                <button
                  onClick={() => setShowOffer(true)}
                  className="px-6 py-3 rounded-xl font-bold text-[#f7931a] transition-all hover:bg-[#f7931a]/10"
                  style={{ border: '1px solid rgba(247,147,26,0.3)' }}
                >
                  Make Offer
                </button>
              </div>
            )}

            {/* Offers */}
            {offers.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">Offers</h3>
                <div className="space-y-2">
                  {offers.map((o: any) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div>
                        <span className="text-sm font-bold text-[#f7931a]">{formatSats(o.amount)} sats</span>
                        <span className="text-xs text-white/30 ml-2">
                          by {o.offerer?.handle ? `@${o.offerer.handle}` : `${o.offererAddress.slice(0, 8)}...`}
                        </span>
                      </div>
                      <span className="text-xs text-white/30">{timeAgo(o.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price History */}
            {sales.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">Price History</h3>
                <PriceChart data={sales} />
              </div>
            )}

            {/* Sale History */}
            {sales.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">Sale History</h3>
                <div className="space-y-2">
                  {sales.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="text-sm">
                        <span className="font-bold text-white">{formatSats(s.price)} sats</span>
                        <span className="text-white/30 ml-2">{satsToUsd(s.price)}</span>
                      </div>
                      <span className="text-xs text-white/30">{timeAgo(s.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showOffer && (
        <OfferModal
          blockHeight={height}
          walletAddress={walletAddress || undefined}
          onClose={() => setShowOffer(false)}
        />
      )}
    </div>
  );
}
