/**
 * Block Genomics — Age Score Component
 *
 * Calculates trust points based on Bitcoin block age.
 * Uses a logarithmic curve: genesis-era blocks are worth more,
 * but with diminishing returns so recent blocks still earn meaningful scores.
 *
 * Formula: score = maxPoints × log2(1 + ageYears) / log2(1 + maxAgeYears)
 *
 * The logarithmic curve ensures:
 * - A 1-year-old block scores ~30% of max
 * - A 5-year-old block scores ~65% of max
 * - A 10-year-old block scores ~82% of max
 * - A 16-year-old block (genesis era) scores ~100% of max
 *
 * @module components/age-score
 * @version 1.0.0
 */

import type {
  AgeComponentScore,
  BlockData,
  ScoreFactor,
  TrustScoreConfig,
} from '../types.js';
import { GENESIS_TIMESTAMP } from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum block age in years for normalization.
 * Set to ~17 years (Bitcoin's age as of 2026).
 * Using a fixed cap so scores remain stable as Bitcoin ages.
 */
const MAX_AGE_YEARS = 17;

/**
 * Bitcoin era boundaries (block heights).
 * Used for human-readable labels, not scoring.
 */
const ERAS: readonly { readonly name: string; readonly startHeight: number }[] = [
  { name: 'Genesis Era', startHeight: 0 },
  { name: 'Early Era', startHeight: 1 },
  { name: 'Satoshi Era', startHeight: 1 },
  { name: 'Post-Satoshi Era', startHeight: 36_000 },
  { name: 'First Halving Era', startHeight: 210_000 },
  { name: 'Second Halving Era', startHeight: 420_000 },
  { name: 'Third Halving Era', startHeight: 630_000 },
  { name: 'Fourth Halving Era', startHeight: 840_000 },
] as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Determines which Bitcoin era a block belongs to.
 *
 * @param height - Block height
 * @returns Era name string
 */
function getEra(height: number): string {
  if (height === 0) return 'Genesis';
  if (height < 36_000) return 'Satoshi Era';
  if (height < 210_000) return 'Pre-Halving Era';
  if (height < 420_000) return 'First Halving Era';
  if (height < 630_000) return 'Second Halving Era';
  if (height < 840_000) return 'Third Halving Era';
  return 'Fourth Halving Era';
}

/**
 * Calculates block age in fractional years from its timestamp.
 *
 * @param blockTimestamp - Unix timestamp of the block
 * @param nowTimestamp - Current Unix timestamp (for determinism)
 * @returns Age in years (float, ≥ 0)
 */
function calculateAgeYears(blockTimestamp: number, nowTimestamp: number): number {
  const ageSeconds = Math.max(0, nowTimestamp - blockTimestamp);
  return ageSeconds / (365.25 * 24 * 3600);
}

/**
 * Logarithmic scoring curve.
 *
 * score = log2(1 + ageYears) / log2(1 + maxAgeYears)
 *
 * Properties:
 * - f(0) = 0
 * - f(MAX_AGE_YEARS) = 1.0
 * - Concave (diminishing returns)
 * - Continuous and differentiable
 *
 * @param ageYears - Block age in years
 * @returns Normalized score (0.0 to 1.0)
 */
function logCurve(ageYears: number): number {
  const capped = Math.min(Math.max(ageYears, 0), MAX_AGE_YEARS);
  return Math.log2(1 + capped) / Math.log2(1 + MAX_AGE_YEARS);
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the age component of the trust score.
 *
 * @param block - Bitcoin block data
 * @param config - Engine configuration (provides maxPoints and nowTimestamp)
 * @returns AgeComponentScore with full breakdown
 *
 * @example
 * ```ts
 * const score = calculateAgeScore(genesisBlock, config);
 * // score.raw ≈ 25 (max), score.ageYears ≈ 17, score.era = 'Genesis'
 * ```
 */
export function calculateAgeScore(
  block: BlockData,
  config: TrustScoreConfig,
): AgeComponentScore {
  const maxPoints = config.weights.age;
  const ageYears = calculateAgeYears(block.timestamp, config.nowTimestamp);
  const era = getEra(block.height);

  // Apply logarithmic curve
  const normalized = logCurve(ageYears);
  const raw = Math.round(normalized * maxPoints * 100) / 100;

  // Genesis block bonus: exact block 0 gets a tiny extra nudge to ensure max score
  const isGenesis = block.height === 0;
  const finalRaw = isGenesis ? maxPoints : Math.min(raw, maxPoints);

  const factors: ScoreFactor[] = [
    {
      name: 'block_age_years',
      inputValue: Math.round(ageYears * 100) / 100,
      contribution: finalRaw,
      description: `Block is ${ageYears.toFixed(1)} years old (logarithmic curve applied)`,
    },
    {
      name: 'era',
      inputValue: era,
      contribution: 0,
      description: `Block belongs to the ${era}`,
    },
  ];

  if (isGenesis) {
    factors.push({
      name: 'genesis_bonus',
      inputValue: 'true',
      contribution: 0,
      description: 'Genesis block receives maximum age score',
    });
  }

  return {
    raw: Math.round(finalRaw * 100) / 100,
    max: maxPoints,
    normalized: Math.round((finalRaw / maxPoints) * 10000) / 10000,
    explanation: `Block #${block.height} is ${ageYears.toFixed(1)} years old (${era}). Age score: ${finalRaw.toFixed(2)}/${maxPoints}`,
    factors,
    ageYears: Math.round(ageYears * 100) / 100,
    era,
  };
}
