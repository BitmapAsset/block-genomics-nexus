'use client';

import { useState } from 'react';
import Image from 'next/image';

const SIZES = {
  xs: { px: 24, text: 'text-[10px]', border: 'border' },
  sm: { px: 32, text: 'text-xs', border: 'border' },
  md: { px: 40, text: 'text-sm', border: 'border-2' },
  lg: { px: 56, text: 'text-lg', border: 'border-2' },
  xl: { px: 80, text: 'text-2xl', border: 'border-2' },
} as const;

export type AvatarSize = keyof typeof SIZES;

interface UserAvatarProps {
  address?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
  size?: AvatarSize;
  className?: string;
  onClick?: () => void;
  showGlow?: boolean;
}

/** Generate a deterministic gradient from a wallet address */
function addressGradient(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 80)) % 360;
  const h3 = (h2 + 40 + Math.abs((hash >> 16) % 80)) % 360;
  const angle = Math.abs((hash >> 24) % 360);
  return `linear-gradient(${angle}deg, hsl(${h1},75%,45%) 0%, hsl(${h2},80%,50%) 50%, hsl(${h3},70%,55%) 100%)`;
}

function getInitial(handle?: string | null, address?: string | null): string {
  if (handle) return handle.charAt(0).toUpperCase();
  if (address) return address.slice(-2).toUpperCase();
  return '?';
}

export default function UserAvatar({
  address,
  avatarUrl,
  handle,
  size = 'md',
  className = '',
  onClick,
  showGlow = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const s = SIZES[size];
  const hasImage = !!avatarUrl && !imgError;

  const glowColor = address ? `hsl(${Math.abs([...address].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 360}, 70%, 50%)` : '#f7931a';

  return (
    <div
      className={`relative rounded-full overflow-hidden flex-shrink-0 ${s.border} border-white/10 transition-all duration-300 hover:border-white/25 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: s.px,
        height: s.px,
        boxShadow: showGlow ? `0 0 15px ${glowColor}40, 0 0 30px ${glowColor}15` : undefined,
      }}
      onClick={onClick}
      title={handle ? `@${handle}` : address ? `${address.slice(0, 8)}…` : undefined}
    >
      {hasImage ? (
        <Image
          src={avatarUrl!}
          alt={handle || 'avatar'}
          width={s.px}
          height={s.px}
          className="object-cover w-full h-full"
          onError={() => setImgError(true)}
          unoptimized
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center ${s.text} font-bold text-white/90`}
          style={{ background: address ? addressGradient(address) : 'linear-gradient(135deg, #f7931a 0%, #aa44ff 100%)' }}
        >
          {getInitial(handle, address)}
        </div>
      )}
    </div>
  );
}
