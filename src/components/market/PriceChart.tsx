'use client';

interface DataPoint {
  price: string;
  createdAt: string;
}

export default function PriceChart({ data, className = '' }: { data: DataPoint[]; className?: string }) {
  if (!data.length) {
    return (
      <div className={`flex items-center justify-center h-48 text-white/30 text-sm ${className}`}>
        No price history yet
      </div>
    );
  }

  const prices = data.map((d) => parseInt(d.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const W = 500;
  const H = 180;
  const PAD = 20;
  const chartW = W - PAD * 2;
  const chartH = H - PAD * 2;

  const points = prices.map((p, i) => {
    const x = PAD + (i / Math.max(prices.length - 1, 1)) * chartW;
    const y = PAD + chartH - ((p - min) / range) * chartH;
    return `${x},${y}`;
  });

  const line = points.join(' ');
  const areaPoints = `${PAD},${PAD + chartH} ${line} ${PAD + chartW},${PAD + chartH}`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7931a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#priceGrad)" />
        <polyline
          points={line}
          fill="none"
          stroke="#f7931a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {prices.map((p, i) => {
          const x = PAD + (i / Math.max(prices.length - 1, 1)) * chartW;
          const y = PAD + chartH - ((p - min) / range) * chartH;
          return <circle key={i} cx={x} cy={y} r="3" fill="#f7931a" opacity="0.8" />;
        })}
      </svg>
    </div>
  );
}
