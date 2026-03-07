// ============================================================================
// Trust Score Calculation
// ============================================================================
// Score range: 0–100
//
// Factor breakdown:
//   Signature valid          +40  (required baseline)
//   Bitmap ownership         +25
//   Block exists on chain    +15
//   Address format quality   +10  (native segwit/taproot > legacy)
//   Inscription age          + 5  (older = more trusted)
//   Block age                + 5  (older blocks = slightly more trusted)
// ============================================================================

import type { TrustFactors } from '../types.js';

export function calculateTrustScore(factors: TrustFactors): number {
  let score = 0;

  // Signature — the foundation. Without it, nothing matters.
  if (factors.signatureValid) score += 40;
  else return 0; // short-circuit: invalid sig = zero trust

  // Bitmap ownership — proves they own the .bitmap inscription
  if (factors.bitmapOwnership) score += 25;

  // Block existence on-chain
  if (factors.blockExists) score += 15;

  // Address format (prefer modern formats)
  switch (factors.addressFormat) {
    case 'taproot':        score += 10; break;
    case 'segwit-native':  score += 8;  break;
    case 'segwit-compat':  score += 5;  break;
    case 'legacy':         score += 3;  break;
    default:               score += 0;
  }

  // Inscription age (days) — older inscriptions are more established
  if (factors.inscriptionAge !== null) {
    if (factors.inscriptionAge > 365) score += 5;
    else if (factors.inscriptionAge > 180) score += 4;
    else if (factors.inscriptionAge > 90) score += 3;
    else if (factors.inscriptionAge > 30) score += 2;
    else if (factors.inscriptionAge > 7) score += 1;
  }

  // Block age (days) — older blocks have more history
  if (factors.blockAge !== null) {
    if (factors.blockAge > 3650) score += 5;       // 10+ years
    else if (factors.blockAge > 1825) score += 4;  // 5+ years
    else if (factors.blockAge > 365) score += 3;   // 1+ year
    else if (factors.blockAge > 30) score += 2;
    else score += 1;
  }

  return Math.min(100, score);
}

/**
 * Determine address format from the address string.
 */
export function detectAddressFormat(address: string): TrustFactors['addressFormat'] {
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) return 'taproot';
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) return 'segwit-native';
  if (address.startsWith('3') || address.startsWith('2')) return 'segwit-compat';
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) return 'legacy';
  return 'unknown';
}
