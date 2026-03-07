/**
 * Block Genomics — Ownership Score Component
 *
 * Calculates trust points based on the strength of ownership proof.
 * This component rewards agents who have stronger on-chain evidence
 * of block ownership.
 *
 * Sub-components:
 * - Bitmap inscription detected: 40% — on-chain bitmap inscription exists
 * - BIP-322 signature verified: 40% — cryptographic proof of wallet ownership
 * - Verification recency: 20% — how recently the signature was produced
 *
 * A fully verified Tier 1 agent with a detected bitmap inscription and
 * a fresh BIP-322 signature earns the full 20 points.
 *
 * @module components/ownership-score
 * @version 1.0.0
 */

import type {
  AgentData,
  BlockData,
  OwnershipComponentScore,
  ScoreFactor,
  TrustScoreConfig,
  VerificationRecord,
} from '../types.js';
import { Tier } from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Sub-component weights (must sum to 1.0) */
const BITMAP_DETECTION_WEIGHT = 0.40;
const SIGNATURE_VERIFICATION_WEIGHT = 0.40;
const RECENCY_WEIGHT = 0.20;

/**
 * Maximum days for full recency score.
 * Verifications within this window get near-full recency points.
 */
const FULL_RECENCY_DAYS = 30;

/**
 * Days after which recency score decays to 50%.
 * After this, recency contributes less.
 */
const HALF_RECENCY_DAYS = 180;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Checks if a bitmap inscription exists for this block.
 *
 * In the PoC, bitmap detection is done by the wallet connection layer.
 * Here we check the agent's verification status and block traits.
 *
 * @param agent - Agent data
 * @param block - Block data
 * @returns Whether a bitmap inscription was detected
 */
function hasBitmapInscription(agent: AgentData, block: BlockData): boolean {
  // Tier 1 agents are block owners with detected bitmap inscriptions
  if (agent.tier === Tier.TIER_1 && agent.verified) {
    return true;
  }

  // Check block traits for bitmap-related traits
  if (block.traits) {
    return block.traits.some(
      (t) => t.trait === 'has_bitmap_inscription' && t.value === true,
    );
  }

  return false;
}

/**
 * Checks if a valid BIP-322 signature exists in verifications.
 *
 * @param verifications - Array of verification records
 * @returns Whether at least one verified signature exists
 */
function hasVerifiedSignature(
  verifications: readonly VerificationRecord[],
): boolean {
  return verifications.some((v) => v.status === 'VERIFIED');
}

/**
 * Calculates recency score based on the most recent verification.
 *
 * Uses exponential decay: score = exp(-days / halfLife × ln(2))
 * At 0 days: 1.0
 * At HALF_RECENCY_DAYS: 0.5
 * Approaches 0 asymptotically
 *
 * @param verifications - Array of verification records
 * @param nowTimestamp - Current Unix timestamp
 * @returns Recency score (0.0 to 1.0)
 */
function calculateRecencyScore(
  verifications: readonly VerificationRecord[],
  nowTimestamp: number,
): { score: number; daysSinceLastVerification: number } {
  const verified = verifications.filter((v) => v.status === 'VERIFIED');
  if (verified.length === 0) {
    return { score: 0, daysSinceLastVerification: Infinity };
  }

  // Find most recent verification
  const mostRecent = verified.reduce((latest, v) => {
    const vTime = new Date(v.createdAt).getTime() / 1000;
    const latestTime = new Date(latest.createdAt).getTime() / 1000;
    return vTime > latestTime ? v : latest;
  });

  const verificationTime = new Date(mostRecent.createdAt).getTime() / 1000;
  const daysSince = Math.max(0, (nowTimestamp - verificationTime) / 86400);

  if (daysSince <= FULL_RECENCY_DAYS) {
    return { score: 1.0, daysSinceLastVerification: Math.round(daysSince) };
  }

  // Exponential decay after grace period
  const effectiveDays = daysSince - FULL_RECENCY_DAYS;
  const halfLife = HALF_RECENCY_DAYS - FULL_RECENCY_DAYS;
  const score = Math.exp((-effectiveDays / halfLife) * Math.LN2);

  return {
    score: Math.max(0, Math.min(1, score)),
    daysSinceLastVerification: Math.round(daysSince),
  };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the ownership component of the trust score.
 *
 * @param agent - Agent data
 * @param block - Block data
 * @param verifications - Verification records for this agent
 * @param config - Engine configuration
 * @returns OwnershipComponentScore with full breakdown
 *
 * @example
 * ```ts
 * const score = calculateOwnershipScore(tier1Agent, block, verifications, config);
 * // score.raw ≈ 20 for a fully verified Tier 1 agent with bitmap inscription
 * ```
 */
export function calculateOwnershipScore(
  agent: AgentData,
  block: BlockData,
  verifications: readonly VerificationRecord[],
  config: TrustScoreConfig,
): OwnershipComponentScore {
  const maxPoints = config.weights.ownership;

  // --- Sub-component 1: Bitmap inscription detection ---
  const bitmapDetected = hasBitmapInscription(agent, block);
  const bitmapScore = bitmapDetected ? 1.0 : 0.0;

  // --- Sub-component 2: BIP-322 signature verification ---
  const signatureVerified = hasVerifiedSignature(verifications);
  const signatureScore = signatureVerified ? 1.0 : 0.0;

  // --- Sub-component 3: Verification recency ---
  const { score: recencyScore, daysSinceLastVerification } =
    calculateRecencyScore(verifications, config.nowTimestamp);

  // Tier-based adjustment for bitmap detection
  // Tier 2/3 agents don't directly own the bitmap, so they get partial credit
  let effectiveBitmapScore = bitmapScore;
  if (agent.tier === Tier.TIER_2) {
    effectiveBitmapScore = bitmapScore * 0.6; // TX-anchored: partial credit
  } else if (agent.tier === Tier.TIER_3) {
    effectiveBitmapScore = bitmapScore * 0.3; // Delegated: minimal credit
  }

  // Weighted combination
  const combined =
    effectiveBitmapScore * BITMAP_DETECTION_WEIGHT +
    signatureScore * SIGNATURE_VERIFICATION_WEIGHT +
    recencyScore * RECENCY_WEIGHT;

  const raw = Math.round(combined * maxPoints * 100) / 100;
  const finalRaw = Math.min(raw, maxPoints);

  const factors: ScoreFactor[] = [
    {
      name: 'bitmap_inscription',
      inputValue: bitmapDetected ? 'detected' : 'not_found',
      contribution:
        Math.round(effectiveBitmapScore * BITMAP_DETECTION_WEIGHT * maxPoints * 100) / 100,
      description: bitmapDetected
        ? `Bitmap inscription detected for block #${block.height}${agent.tier !== Tier.TIER_1 ? ` (Tier ${agent.tier} partial credit: ${(effectiveBitmapScore * 100).toFixed(0)}%)` : ''}`
        : 'No bitmap inscription detected',
    },
    {
      name: 'bip322_signature',
      inputValue: signatureVerified ? 'verified' : 'unverified',
      contribution:
        Math.round(signatureScore * SIGNATURE_VERIFICATION_WEIGHT * maxPoints * 100) / 100,
      description: signatureVerified
        ? 'BIP-322 signature verified on-chain'
        : 'No verified BIP-322 signature',
    },
    {
      name: 'verification_recency',
      inputValue: daysSinceLastVerification,
      contribution: Math.round(recencyScore * RECENCY_WEIGHT * maxPoints * 100) / 100,
      description:
        daysSinceLastVerification === Infinity
          ? 'No verifications on record'
          : `Last verified ${daysSinceLastVerification} days ago (recency: ${(recencyScore * 100).toFixed(1)}%)`,
    },
  ];

  return {
    raw: Math.round(finalRaw * 100) / 100,
    max: maxPoints,
    normalized: Math.round((finalRaw / maxPoints) * 10000) / 10000,
    explanation: `Ownership proof: bitmap=${bitmapDetected ? 'yes' : 'no'}, signature=${signatureVerified ? 'yes' : 'no'}, recency=${daysSinceLastVerification}d. Score: ${finalRaw.toFixed(2)}/${maxPoints}`,
    factors,
    bitmapDetected,
    signatureVerified,
  };
}
