'use client';

const BTC_USD_RATE = 100000; // approximate, can be updated

export function formatSats(sats: number | string): string {
  const n = typeof sats === 'string' ? parseInt(sats) : sats;
  return n.toLocaleString();
}

export function satsToBtc(sats: number | string): string {
  const n = typeof sats === 'string' ? parseInt(sats) : sats;
  return (n / 100_000_000).toFixed(8).replace(/\.?0+$/, '');
}

export function satsToUsd(sats: number | string): string {
  const n = typeof sats === 'string' ? parseInt(sats) : sats;
  const usd = (n / 100_000_000) * BTC_USD_RATE;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(0)}`;
  return `$${(usd / 1000).toFixed(1)}k`;
}

interface PriceDisplayProps {
  sats: number | string;
  size?: 'sm' | 'md' | 'lg';
  showUsd?: boolean;
  className?: string;
}

export default function PriceDisplay({ sats, size = 'md', showUsd = true, className = '' }: PriceDisplayProps) {
  const n = typeof sats === 'string' ? parseInt(sats) : sats;
  const textSize = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-sm';
  const subSize = size === 'lg' ? 'text-sm' : 'text-xs';

  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className={`${textSize} font-bold text-[#f7931a]`}>
        {formatSats(n)} <span className="text-[#f7931a]/70 font-normal">sats</span>
      </span>
      <span className={`${subSize} text-white/40`}>
        ({satsToBtc(n)} ₿{showUsd && ` ≈ ${satsToUsd(n)}`})
      </span>
    </div>
  );
}
