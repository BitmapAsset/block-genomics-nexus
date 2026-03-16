'use client';

import { useBlockHeight } from '@/hooks/useBlockHeight';

export default function LiveBlockCount() {
  const height = useBlockHeight();

  return (
    <span>{height ? `${(height / 1000).toFixed(0)}K+` : '880K+'}</span>
  );
}
