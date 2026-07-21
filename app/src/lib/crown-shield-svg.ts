import { TIER_BADGE_COLORS, VerificationTier } from '@/lib/protocol';

/**
 * Server-safe Crown Shield SVG string.
 *
 * This lives OUTSIDE the 'use client' CrownShield component on purpose: a
 * function exported from a 'use client' module cannot be invoked across the
 * RSC server boundary in a production build (it throws "Attempted to call
 * crownShieldSVGString() from the server..."), which is what made
 * GET /api/v1/badge/[id] return 500. Server route handlers import from here.
 */

export type ShieldTier = 0 | 1 | 2 | 3;

// Tier 1/2/3 primaries come from the protocol SSOT so badge colors never drift.
const T1 = TIER_BADGE_COLORS[VerificationTier.TIER_1_BLOCK_OWNER].primary;
const T2 = TIER_BADGE_COLORS[VerificationTier.TIER_2_PARCEL_OWNER].primary;
const T3 = TIER_BADGE_COLORS[VerificationTier.TIER_3_DELEGATED].primary;

const SVG_TIER_COLORS: Record<ShieldTier, { primary: string; light: string }> = {
  0: { primary: '#6b7280', light: '#9ca3af' },
  1: { primary: T1, light: '#ffe066' },
  2: { primary: T2, light: '#88eeff' },
  3: { primary: T3, light: '#d88bff' },
};

/**
 * Inline SVG string for API routes, canvas textures, etc.
 */
export function crownShieldSVGString(tier: ShieldTier = 1, verified = true, size = 200): string {
  const c = SVG_TIER_COLORS[tier] ?? SVG_TIER_COLORS[0];
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
