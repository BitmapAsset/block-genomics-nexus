'use client';

import Link from 'next/link';
import BitmapThumbnail from '@/components/BitmapThumbnail';
import CrownShield from '@/components/CrownShield';
import EpochBadge from './EpochBadge';
import PriceDisplay from './PriceDisplay';

interface BitmapCardProps {
  blockHeight: number;
  price: string;
  seller: {
    walletAddress: string;
    handle?: string | null;
    tier?: number;
    verified?: boolean;
  };
  hasWorldBuilt?: boolean;
  hasGuardian?: boolean;
  status?: string;
}

export default function BitmapCard({
  blockHeight,
  price,
  seller,
  hasWorldBuilt,
  hasGuardian,
  status = 'active',
}: BitmapCardProps) {
  return (
    <Link href={`/market/${blockHeight}`} className="group block">
      <div
        className="relative rounded-2xl overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_8px_40px_rgba(247,147,26,0.15)]"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Hover border glow */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ border: '1px solid rgba(247,147,26,0.3)' }}
        />

        {/* Thumbnail */}
        <div className="relative aspect-square bg-black/30 flex items-center justify-center overflow-hidden">
          <BitmapThumbnail blockHeight={blockHeight} size={200} />

          {/* Badges overlay */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            <EpochBadge height={blockHeight} />
            {hasWorldBuilt && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                🏗️ World Built
              </span>
            )}
            {hasGuardian && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                🤖 Guardian
              </span>
            )}
          </div>

          {/* Verified badge */}
          {seller.verified && (
            <div className="absolute top-2.5 right-2.5">
              <CrownShield tier={(seller.tier as 1 | 2 | 3) || 3} size={28} verified />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-2.5">
          <div className="flex justify-between items-start">
            <div className="text-lg font-bold text-white">
              #{blockHeight.toLocaleString()}
            </div>
          </div>

          <PriceDisplay sats={price} size="sm" />

          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 truncate max-w-[120px]">
              {seller.handle ? `@${seller.handle}` : `${seller.walletAddress.slice(0, 8)}...`}
            </span>
            {status === 'active' && (
              <span
                className="px-3 py-1 text-xs font-bold rounded-lg text-white transition-all group-hover:shadow-[0_0_15px_rgba(247,147,26,0.4)]"
                style={{ background: 'linear-gradient(135deg, #f7931a, #e2761b)' }}
              >
                Buy Now
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
