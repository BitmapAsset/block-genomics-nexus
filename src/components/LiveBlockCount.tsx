'use client';

import { useEffect, useState } from 'react';

export default function LiveBlockCount() {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch_height() {
      try {
        const res = await fetch('https://mempool.space/api/blocks/tip/height');
        if (!res.ok) return;
        const h = await res.json();
        if (!cancelled) setHeight(h);
      } catch { /* silent */ }
    }
    fetch_height();
    const iv = setInterval(fetch_height, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <span>{height ? `${(height / 1000).toFixed(0)}K+` : '880K+'}</span>
  );
}
