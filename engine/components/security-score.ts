/**
 * Block Genomics — Security Score Component
 *
 * Calculates trust points based on the mining security of a block.
 * Higher difficulty and better hash quality indicate more proof-of-work
 * was expended, making the block (and its verification) harder to forge.
 *
 * Sub-components:
 * - Mining difficulty: 60% — log-scaled against current network difficulty
 * - Hash quality: 25% — number of leading zero bits in block hash
 * - Nonce entropy: 15% — how "random" the nonce appears (anti-grinding signal)
 *
 * @module components/security-score
 * @version 1.0.0
 */

import type {
  BlockData,
  ScoreFactor,
  SecurityComponentScore,
  TrustScoreConfig,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Reference difficulty for normalization.
 * As of 2026, Bitcoin difficulty is ~100T (100 × 10^12).
 * This should be updated periodically or fetched dynamically.
 */
const REFERENCE_DIFFICULTY = 100e12;

/**
 * Maximum theoretical leading zero bits for Bitcoin (~256 for SHA-256).
 * In practice, current difficulty requires ~75-80 leading zero bits.
 */
const MAX_LEADING_ZEROS = 80;

/** Sub-component weights (must sum to 1.0) */
const DIFFICULTY_WEIGHT = 0.60;
const HASH_QUALITY_WEIGHT = 0.25;
const NONCE_ENTROPY_WEIGHT = 0.15;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Counts leading zero bits in a hex hash string.
 *
 * Each hex character is 4 bits. A '0' hex char = 4 leading zeros.
 * First non-zero hex char contributes 0-3 leading zeros based on its value.
 *
 * @param hash - Block hash as hex string (no 0x prefix)
 * @returns Number of leading zero bits
 */
export function countLeadingZeroBits(hash: string): number {
  let zeroBits = 0;

  for (let i = 0; i < hash.length; i++) {
    const nibble = parseInt(hash[i], 16);
    if (isNaN(nibble)) continue;

    if (nibble === 0) {
      zeroBits += 4;
    } else {
      // Count leading zeros in this 4-bit nibble
      if (nibble < 2) zeroBits += 3;       // 0001 → 3 leading zeros
      else if (nibble < 4) zeroBits += 2;  // 001x → 2 leading zeros
      else if (nibble < 8) zeroBits += 1;  // 01xx → 1 leading zero
      // else: 1xxx → 0 leading zeros
      break;
    }
  }

  return zeroBits;
}

/**
 * Calculates nonce entropy score.
 *
 * A truly random nonce (as expected from honest mining) should have
 * a relatively even bit distribution. Nonces that are suspiciously
 * patterned (e.g., all zeros, sequential) get lower scores.
 *
 * Uses bit-distribution analysis of the 32-bit nonce.
 *
 * @param nonce - Mining nonce (uint32)
 * @returns Entropy score (0.0 to 1.0, 1.0 = maximum entropy)
 */
function calculateNonceEntropy(nonce: number): number {
  if (nonce === 0) return 0.1; // Suspiciously zero, but not impossible

  // Count set bits (Hamming weight)
  let n = nonce >>> 0; // Ensure unsigned 32-bit
  let bitCount = 0;
  while (n) {
    bitCount += n & 1;
    n >>>= 1;
  }

  // For a random 32-bit number, expected Hamming weight is ~16
  // Score based on how close to 16 the bit count is
  const idealBits = 16;
  const deviation = Math.abs(bitCount - idealBits);

  // Max deviation is 16 (all zeros or all ones), score drops linearly
  const entropyScore = 1.0 - (deviation / idealBits);

  // Clamp to [0.1, 1.0] — even bad nonces shouldn't zero out
  return Math.max(0.1, entropyScore);
}

/**
 * Log-scaled difficulty score.
 *
 * score = log10(1 + difficulty) / log10(1 + referenceDifficulty)
 * Capped at 1.0.
 *
 * Early blocks (difficulty 1) get a low score here.
 * Modern blocks (difficulty ~100T) score near 1.0.
 *
 * @param difficulty - Block mining difficulty
 * @returns Normalized score (0.0 to 1.0)
 */
function logScaleDifficulty(difficulty: number): number {
  if (difficulty <= 0) return 0;
  const score = Math.log10(1 + difficulty) / Math.log10(1 + REFERENCE_DIFFICULTY);
  return Math.min(score, 1.0);
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the security component of the trust score.
 *
 * @param block - Bitcoin block data
 * @param config - Engine configuration
 * @returns SecurityComponentScore with full breakdown
 *
 * @example
 * ```ts
 * const score = calculateSecurityScore(modernBlock, config);
 * // score.raw ≈ 18-20 for a high-difficulty block
 * ```
 */
export function calculateSecurityScore(
  block: BlockData,
  config: TrustScoreConfig,
): SecurityComponentScore {
  const maxPoints = config.weights.security;

  // --- Sub-component 1: Mining difficulty ---
  const difficultyNorm = logScaleDifficulty(block.difficulty);

  // --- Sub-component 2: Hash quality ---
  const leadingZeros = countLeadingZeroBits(block.hash);
  const hashQuality = Math.min(leadingZeros / MAX_LEADING_ZEROS, 1.0);

  // --- Sub-component 3: Nonce entropy ---
  const nonceEntropy = calculateNonceEntropy(block.nonce);

  // Weighted combination
  const combined =
    difficultyNorm * DIFFICULTY_WEIGHT +
    hashQuality * HASH_QUALITY_WEIGHT +
    nonceEntropy * NONCE_ENTROPY_WEIGHT;

  const raw = Math.round(combined * maxPoints * 100) / 100;
  const finalRaw = Math.min(raw, maxPoints);

  const factors: ScoreFactor[] = [
    {
      name: 'mining_difficulty',
      inputValue: block.difficulty,
      contribution: Math.round(difficultyNorm * DIFFICULTY_WEIGHT * maxPoints * 100) / 100,
      description: `Difficulty ${block.difficulty.toExponential(2)} (log-scaled: ${(difficultyNorm * 100).toFixed(1)}% of reference)`,
    },
    {
      name: 'hash_quality',
      inputValue: leadingZeros,
      contribution: Math.round(hashQuality * HASH_QUALITY_WEIGHT * maxPoints * 100) / 100,
      description: `${leadingZeros} leading zero bits in block hash (${(hashQuality * 100).toFixed(1)}% of max)`,
    },
    {
      name: 'nonce_entropy',
      inputValue: block.nonce,
      contribution: Math.round(nonceEntropy * NONCE_ENTROPY_WEIGHT * maxPoints * 100) / 100,
      description: `Nonce ${block.nonce}: entropy score ${(nonceEntropy * 100).toFixed(1)}%`,
    },
  ];

  return {
    raw: Math.round(finalRaw * 100) / 100,
    max: maxPoints,
    normalized: Math.round((finalRaw / maxPoints) * 10000) / 10000,
    explanation: `Block #${block.height}: difficulty ${block.difficulty.toExponential(2)}, ${leadingZeros} leading zero bits. Security: ${finalRaw.toFixed(2)}/${maxPoints}`,
    factors,
    difficulty: block.difficulty,
    leadingZeroBits: leadingZeros,
  };
}
