'use client';

import React from 'react';
import { TIER_BADGE_COLORS, VerificationTier } from '@/lib/protocol';

/**
 * 👑🛡️ A2 Crown Shield — Block Genomics
 *
 * FINAL design per Gravity's screenshot (2026-02-11):
 * - Wide rounded shield with thick neon-glow border
 * - 3-spike crown with orb tips sitting on shield edge
 * - Inner border line
 * - Large ₿ center in tier color
 * - Green ✓ bottom-left
 * - Strong outer glow (cyberpunk neon)
 * - Tiers: Gold, Cyan, Purple
 */

// 0 = unverified (no on-chain tier resolved yet). 1/2/3 = block/parcel/delegated.
export type ShieldTier = 0 | 1 | 2 | 3;

interface CrownShieldProps {
  tier?: ShieldTier;
  size?: number;
  verified?: boolean;
  className?: string;
  glow?: boolean;
  /** 'dot' for small inline shields, 'check' for large shields (verify page, profile hero, modals). Auto-selects based on size if omitted. */
  verifiedStyle?: 'dot' | 'check';
}

// Tier 1/2/3 primaries are sourced from the protocol SSOT (TIER_BADGE_COLORS) so
// badge colors never drift from protocol.ts. T1 = #FFD700 gold, T2 = #00CCFF cyan,
// T3 = #AA44FF purple. Tier 0 is the local "unverified" grey state (no protocol entry).
const T1 = TIER_BADGE_COLORS[VerificationTier.TIER_1_BLOCK_OWNER].primary;
const T2 = TIER_BADGE_COLORS[VerificationTier.TIER_2_PARCEL_OWNER].primary;
const T3 = TIER_BADGE_COLORS[VerificationTier.TIER_3_DELEGATED].primary;

const TIER_COLORS: Record<ShieldTier, { primary: string; light: string; glow: string; glowRgba: string }> = {
  0: { primary: '#6b7280', light: '#9ca3af', glow: '#6b7280', glowRgba: 'rgba(107,114,128,' },
  1: { primary: T1, light: '#ffe066', glow: T1, glowRgba: 'rgba(255,215,0,' },
  2: { primary: T2, light: '#88eeff', glow: T2, glowRgba: 'rgba(0,204,255,' },
  3: { primary: T3, light: '#d88bff', glow: T3, glowRgba: 'rgba(170,68,255,' },
};

const CrownShield: React.FC<CrownShieldProps> = ({
  tier = 1,
  size = 48,
  verified = true,
  className,
  glow = true,
  verifiedStyle,
}) => {
  // Auto-select: dot for small shields (≤40px), checkmark for larger
  const vStyle = verifiedStyle ?? (size <= 40 ? 'dot' : 'check');
  const c = TIER_COLORS[tier];
  // Tier 0 is unverified: no crown, no verified mark — just a muted grey shield.
  const showCrown = tier !== 0;
  const showVerified = verified && tier !== 0;
  const uid = `cs${tier}${Math.random().toString(36).slice(2, 5)}`;

  // Shield path — wide, rounded, generous curves matching the screenshot
  const shieldPath = `
    M 50 18
    C 30 18, 10 24, 8 36
    L 8 62
    C 8 82, 22 96, 50 108
    C 78 96, 92 82, 92 62
    L 92 36
    C 90 24, 70 18, 50 18 Z
  `;

  // Inner shield (slightly inset)
  const innerShieldPath = `
    M 50 23
    C 33 23, 15 28, 13 38
    L 13 61
    C 13 79, 25 91, 50 102
    C 75 91, 87 79, 87 61
    L 87 38
    C 85 28, 67 23, 50 23 Z
  `;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={glow ? { filter: `drop-shadow(0 0 ${Math.max(4, size * 0.15)}px ${c.glowRgba}0.6))` } : undefined}
    >
      <defs>
        {/* Shield fill */}
        <linearGradient id={`${uid}f`} x1="50" y1="18" x2="50" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e1e38" />
          <stop offset="100%" stopColor="#0c0c1a" />
        </linearGradient>

        {/* Border gradient */}
        <linearGradient id={`${uid}b`} x1="8" y1="18" x2="92" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="50%" stopColor={c.primary} />
          <stop offset="100%" stopColor={c.light} />
        </linearGradient>

        {/* Neon glow filter */}
        <filter id={`${uid}g`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* ₿ gradient */}
        <linearGradient id={`${uid}t`} x1="50" y1="40" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor={c.primary} />
        </linearGradient>
      </defs>

      {/* ═══ OUTER GLOW LAYER ═══ */}
      <path d={shieldPath} stroke={c.primary} strokeWidth="6" fill="none" opacity="0.25" filter={`url(#${uid}g)`} />

      {/* ═══ SHIELD BODY ═══ */}
      <path d={shieldPath} fill={`url(#${uid}f)`} />

      {/* ═══ OUTER BORDER (thick) ═══ */}
      <path d={shieldPath} fill="none" stroke={`url(#${uid}b)`} strokeWidth="3" />

      {/* ═══ INNER BORDER (thin) ═══ */}
      <path d={innerShieldPath} fill="none" stroke={c.primary} strokeWidth="1" opacity="0.35" />

      {/* ═══ CROWN (3 spikes with orb tips) — hidden for unverified T0 ═══ */}
      {showCrown && (<>
      <path
        d={`
          M 30 22
          L 34 8
          L 42 18
          L 50 4
          L 58 18
          L 66 8
          L 70 22
        `}
        fill="none"
        stroke={c.primary}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Crown fill */}
      <path
        d={`
          M 30 22
          L 34 8
          L 42 18
          L 50 4
          L 58 18
          L 66 8
          L 70 22
          Z
        `}
        fill={c.primary}
        opacity="0.7"
      />
      {/* Crown orb tips */}
      <circle cx="34" cy="7" r="3" fill={c.light} />
      <circle cx="50" cy="3" r="3.5" fill={c.light} />
      <circle cx="66" cy="7" r="3" fill={c.light} />
      {/* Crown orb glow */}
      <circle cx="34" cy="7" r="5" fill={c.light} opacity="0.2" />
      <circle cx="50" cy="3" r="6" fill={c.light} opacity="0.2" />
      <circle cx="66" cy="7" r="5" fill={c.light} opacity="0.2" />
      </>)}

      {/* ═══ ₿ SYMBOL ═══ */}
      <text
        x="50"
        y="65"
        textAnchor="middle"
        dominantBaseline="central"
        fill={`url(#${uid}t)`}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="42"
        fontWeight="bold"
      >
        ₿
      </text>
      {/* ₿ subtle glow */}
      <text
        x="50"
        y="65"
        textAnchor="middle"
        dominantBaseline="central"
        fill={c.primary}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="42"
        fontWeight="bold"
        opacity="0.15"
        filter={`url(#${uid}g)`}
      />

      {/* ═══ BITMAP BLOCK PATTERN (subtle background texture) ═══ */}
      <g opacity="0.35" clipPath={`url(#${uid}clip)`}>
        <defs>
          <clipPath id={`${uid}clip`}>
            <path d={innerShieldPath} />
          </clipPath>
        </defs>
        {/* Grid of small blocks — Mondrian-style */}
        <rect x="14" y="30" width="12" height="10" rx="1" fill={c.primary} opacity="0.3" />
        <rect x="28" y="28" width="8" height="8" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="38" y="32" width="14" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="55" y="29" width="10" height="10" rx="1" fill={c.primary} opacity="0.3" />
        <rect x="67" y="30" width="7" height="7" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="76" y="28" width="9" height="11" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="16" y="44" width="18" height="8" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="36" y="42" width="6" height="12" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="44" y="44" width="15" height="7" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="62" y="43" width="10" height="9" rx="1" fill={c.primary} opacity="0.3" />
        <rect x="74" y="44" width="11" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="18" y="56" width="8" height="14" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="28" y="58" width="16" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="46" y="55" width="9" height="10" rx="1" fill={c.primary} opacity="0.3" />
        <rect x="58" y="57" width="12" height="7" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="72" y="56" width="8" height="9" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="22" y="72" width="14" height="8" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="38" y="70" width="10" height="10" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="50" y="72" width="16" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="68" y="71" width="8" height="8" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="30" y="84" width="12" height="7" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="44" y="83" width="8" height="10" rx="1" fill={c.primary} opacity="0.25" />
        <rect x="55" y="85" width="14" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="38" y="95" width="10" height="6" rx="1" fill={c.primary} opacity="0.2" />
        <rect x="50" y="94" width="12" height="5" rx="1" fill={c.primary} opacity="0.2" />
      </g>

      {/* ═══ GREEN VERIFIED INDICATOR ═══ */}
      {showVerified && vStyle === 'dot' && (
        <g>
          <circle cx="50" cy="96" r="5" fill="#22ff88" />
          <circle cx="50" cy="96" r="8" fill="#22ff88" opacity="0.15" filter={`url(#${uid}g)`} />
        </g>
      )}
      {showVerified && vStyle === 'check' && (
        <g>
          <circle cx="50" cy="96" r="7" fill="#22ff88" opacity="0.2" />
          <path d="M 41 96 L 48 103 L 60 89" stroke="#22ff88" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 41 96 L 48 103 L 60 89" stroke="#22ff88" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.3" filter={`url(#${uid}g)`} />
        </g>
      )}
    </svg>
  );
};

export default CrownShield;

/**
 * Inline SVG string for API routes, canvas textures, etc.
 */
export function crownShieldSVGString(tier: ShieldTier = 1, verified = true, size = 200): string {
  const c = TIER_COLORS[tier];
  const showCrown = tier !== 0;
  const showVerified = verified && tier !== 0;
  const sp = 'M 50 18 C 30 18, 10 24, 8 36 L 8 62 C 8 82, 22 96, 50 108 C 78 96, 92 82, 92 62 L 92 36 C 90 24, 70 18, 50 18 Z';
  const ip = 'M 50 23 C 33 23, 15 28, 13 38 L 13 61 C 13 79, 25 91, 50 102 C 75 91, 87 79, 87 61 L 87 38 C 85 28, 67 23, 50 23 Z';
  const crown = 'M 30 22 L 34 8 L 42 18 L 50 4 L 58 18 L 66 8 L 70 22 Z';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 115 / 100)}" viewBox="0 0 100 115" fill="none">
  <defs>
    <linearGradient id="f" x1="50" y1="18" x2="50" y2="108" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e1e38"/><stop offset="100%" stop-color="#0c0c1a"/>
    </linearGradient>
    <linearGradient id="b" x1="8" y1="18" x2="92" y2="108" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${c.light}"/><stop offset="50%" stop-color="${c.primary}"/><stop offset="100%" stop-color="${c.light}"/>
    </linearGradient>
    <linearGradient id="t" x1="50" y1="40" x2="50" y2="80" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${c.light}"/><stop offset="50%" stop-color="#fff" stop-opacity="0.9"/><stop offset="100%" stop-color="${c.primary}"/>
    </linearGradient>
    <filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="3"/></filter>
  </defs>
  <path d="${sp}" stroke="${c.primary}" stroke-width="6" fill="none" opacity="0.25" filter="url(#g)"/>
  <path d="${sp}" fill="url(#f)"/>
  <path d="${sp}" fill="none" stroke="url(#b)" stroke-width="3"/>
  <path d="${ip}" fill="none" stroke="${c.primary}" stroke-width="1" opacity="0.35"/>
  ${showCrown ? `<path d="${crown}" fill="${c.primary}" opacity="0.7"/>
  <circle cx="34" cy="7" r="3" fill="${c.light}"/><circle cx="50" cy="3" r="3.5" fill="${c.light}"/><circle cx="66" cy="7" r="3" fill="${c.light}"/>` : ''}
  <text x="50" y="65" text-anchor="middle" dominant-baseline="central" fill="url(#t)" font-family="system-ui" font-size="42" font-weight="bold">₿</text>
  ${showVerified ? '<circle cx="50" cy="96" r="5" fill="#22ff88"/>' : ''}
</svg>`;
}

/**
 * Tiny inline Crown Shield for status badges (simplified, no filters)
 */
export function CrownShieldInline({ size = 16, tier = 1 as ShieldTier }: { size?: number; tier?: ShieldTier }) {
  const c = TIER_COLORS[tier];
  const showCrown = tier !== 0;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" fill="none" className="inline-block">
      <path d="M 50 18 C 30 18, 10 24, 8 36 L 8 62 C 8 82, 22 96, 50 108 C 78 96, 92 82, 92 62 L 92 36 C 90 24, 70 18, 50 18 Z" fill="#12121a" stroke={c.primary} strokeWidth="3"/>
      {showCrown && (<>
        <path d="M 30 22 L 34 8 L 42 18 L 50 4 L 58 18 L 66 8 L 70 22 Z" fill={c.primary} opacity="0.7"/>
        <circle cx="34" cy="7" r="3" fill={c.light}/><circle cx="50" cy="3" r="3.5" fill={c.light}/><circle cx="66" cy="7" r="3" fill={c.light}/>
      </>)}
      <text x="50" y="65" textAnchor="middle" dominantBaseline="central" fill={c.primary} fontFamily="system-ui" fontSize="42" fontWeight="bold">₿</text>
      {showCrown && <circle cx="50" cy="96" r="5" fill="#22ff88"/>}
    </svg>
  );
}
