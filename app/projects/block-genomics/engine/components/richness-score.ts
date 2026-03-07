/**
 * Block Genomics — Richness Score Component
 *
 * Calculates trust points based on how "rich" (active) a block was.
 * Factors: transaction count, block size/weight, total output value.
 *
 * Higher activity blocks indicate real economic usage, which is harder
 * to game and suggests the block is economically significant.
 *
 * Sub-components (weighted within the richness score):
 * - Transaction density: 40% — tx_count / max expected (~4000)
 * - Size utilization: 30% — weight / 4M weight units
 * - Value throughput: 30% — total output value (log-scaled)
 *
 * Each sub-component uses a sigmoid-like curve to handle outliers.
 *
 * @module components/richness-score
 * @version 1.0.0
 */

import type {
  BlockData,
  RichnessComponentScore,
  ScoreFactor,
  TrustScoreConfig,
} from '../types.js';
import { MAX_BLOCK_WEIGHT } from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Typical high transaction count for a full block */
const HIGH_TX_COUNT = 4000;

/** Sub-component weights within richness (must sum to 1.0) */
const TX_DENSITY_WEIGHT = 0.4;
const SIZE_UTILIZATION_WEIGHT = 0.3;
const VALUE_THROUGHPUT_WEIGHT = 0.3;

/**
 * Reference total output for log-scaling (10 BTC = 1,000,000,000 sats).
 * Blocks with outputs >= this value score near-max on value throughput.
 */
const REFERENCE_OUTPUT_SATS = 1_000_000_000n;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Soft-capped ratio: approaches 1.0 asymptotically.
 * Uses formula: x / (x + k) where k is the half-saturation constant.
 * At x = k, result = 0.5. At x = 3k, result = 0.75.
 *
 * @param value - Input value (≥ 0)
 * @param halfSat - Value at which output = 0.5
 * @returns Normalized score (0.0 to 1.0, exclusive of 1.0)
 */
function softCap(value: number, halfSat: number): number {
  if (value <= 0) return 0;
  if (halfSat <= 0) return 1;
  return value / (value + halfSat);
}

/**
 * Log-based scoring for satoshi amounts.
 * score = log10(1 + sats) / log10(1 + referenceSats)
 * Capped at 1.0.
 *
 * @param sats - Amount in satoshis (bigint)
 * @param reference - Reference amount for normalization (bigint)
 * @returns Normalized score (0.0 to 1.0)
 */
function logScaleSats(sats: bigint, reference: bigint): number {
  if (sats <= 0n) return 0;
  // Convert to Number for log — safe for values up to ~9 quadrillion sats
  const satsNum = Number(sats);
  const refNum = Number(reference);
  const score = Math.log10(1 + satsNum) / Math.log10(1 + refNum);
  return Math.min(score, 1.0);
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the richness component of the trust score.
 *
 * @param block - Bitcoin block data
 * @param config - Engine configuration
 * @returns RichnessComponentScore with full breakdown
 *
 * @example
 * ```ts
 * const score = calculateRichnessScore(fullBlock, config);
 * // score.raw ≈ 20+ for a block with 3000 txs and high utilization
 * ```
 */
export function calculateRichnessScore(
  block: BlockData,
  config: TrustScoreConfig,
): RichnessComponentScore {
  const maxPoints = config.weights.richness;

  // --- Sub-component 1: Transaction density ---
  // softCap with halfSat at HIGH_TX_COUNT/2 (2000 txs → 0.5 score)
  const txDensity = softCap(block.txCount, HIGH_TX_COUNT / 2);

  // --- Sub-component 2: Size utilization ---
  // Direct ratio capped at 1.0 (block weight / max weight)
  const sizeRatio = Math.min(block.weight / MAX_BLOCK_WEIGHT, 1.0);

  // --- Sub-component 3: Value throughput ---
  let valueThroughput = 0;
  if (block.totalOutputSats !== undefined && block.totalOutputSats > 0n) {
    valueThroughput = logScaleSats(block.totalOutputSats, REFERENCE_OUTPUT_SATS);
  } else {
    // If no total output data, estimate from tx count and size
    // Use the average of tx density and size as a proxy
    valueThroughput = (txDensity + sizeRatio) / 2;
  }

  // Weighted combination
  const combined =
    txDensity * TX_DENSITY_WEIGHT +
    sizeRatio * SIZE_UTILIZATION_WEIGHT +
    valueThroughput * VALUE_THROUGHPUT_WEIGHT;

  const raw = Math.round(combined * maxPoints * 100) / 100;
  const finalRaw = Math.min(raw, maxPoints);

  // Special case: genesis block has 1 tx (the coinbase), minimal size
  // We don't penalize it — its richness is naturally low, but that's accurate

  const factors: ScoreFactor[] = [
    {
      name: 'tx_density',
      inputValue: block.txCount,
      contribution: Math.round(txDensity * TX_DENSITY_WEIGHT * maxPoints * 100) / 100,
      description: `${block.txCount} transactions (soft-capped density: ${(txDensity * 100).toFixed(1)}%)`,
    },
    {
      name: 'size_utilization',
      inputValue: block.weight,
      contribution: Math.round(sizeRatio * SIZE_UTILIZATION_WEIGHT * maxPoints * 100) / 100,
      description: `Block weight ${block.weight.toLocaleString()} / ${MAX_BLOCK_WEIGHT.toLocaleString()} WU (${(sizeRatio * 100).toFixed(1)}% utilization)`,
    },
    {
      name: 'value_throughput',
      inputValue: block.totalOutputSats !== undefined ? block.totalOutputSats.toString() : 'estimated',
      contribution: Math.round(valueThroughput * VALUE_THROUGHPUT_WEIGHT * maxPoints * 100) / 100,
      description: block.totalOutputSats !== undefined
        ? `Total output: ${block.totalOutputSats.toLocaleString()} sats (log-scaled: ${(valueThroughput * 100).toFixed(1)}%)`
        : `Value estimated from tx density and size (${(valueThroughput * 100).toFixed(1)}%)`,
    },
  ];

  return {
    raw: Math.round(finalRaw * 100) / 100,
    max: maxPoints,
    normalized: Math.round((finalRaw / maxPoints) * 10000) / 10000,
    explanation: `Block #${block.height}: ${block.txCount} txs, ${block.weight.toLocaleString()} WU. Richness: ${finalRaw.toFixed(2)}/${maxPoints}`,
    factors,
    txCount: block.txCount,
    blockSize: block.size,
    totalOutputSats: block.totalOutputSats,
  };
}
