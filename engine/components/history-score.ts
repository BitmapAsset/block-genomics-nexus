/**
 * Block Genomics — History Score Component
 *
 * Calculates trust points based on verification history, claim count,
 * and overall community standing.
 *
 * A longer, more consistent verification history indicates a reliable
 * agent. This component rewards agents who regularly re-verify and
 * maintain an active presence.
 *
 * Sub-components:
 * - Verification count: 40% — number of successful verifications (log-scaled)
 * - Verification consistency: 35% — regularity of re-verification (low variance = better)
 * - Account age: 25% — how long since the agent first registered
 *
 * New agents start with a base score to avoid cold-start penalty being too harsh.
 *
 * @module components/history-score
 * @version 1.0.0
 */

import type {
  AgentData,
  HistoryComponentScore,
  ScoreFactor,
  TrustScoreConfig,
  VerificationRecord,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Sub-component weights (must sum to 1.0) */
const VERIFICATION_COUNT_WEIGHT = 0.40;
const CONSISTENCY_WEIGHT = 0.35;
const ACCOUNT_AGE_WEIGHT = 0.25;

/** Number of verifications for near-max count score */
const HIGH_VERIFICATION_COUNT = 10;

/** Account age (in days) for full account age score */
const MATURE_ACCOUNT_DAYS = 365;

/** Base score for brand-new agents (prevents harsh cold start) */
const NEW_AGENT_BASE_SCORE = 0.3;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Log-scaled verification count score.
 *
 * score = log2(1 + count) / log2(1 + HIGH_VERIFICATION_COUNT)
 * Capped at 1.0.
 *
 * 1 verification → ~28%
 * 3 verifications → ~57%
 * 5 verifications → ~72%
 * 10 verifications → 100%
 *
 * @param count - Number of successful verifications
 * @returns Normalized score (0.0 to 1.0)
 */
function verificationCountScore(count: number): number {
  if (count <= 0) return 0;
  const score = Math.log2(1 + count) / Math.log2(1 + HIGH_VERIFICATION_COUNT);
  return Math.min(score, 1.0);
}

/**
 * Calculates verification consistency based on interval regularity.
 *
 * For agents with 2+ verifications, measures how evenly spaced they are.
 * Uses coefficient of variation (CV) of intervals between verifications.
 * Lower CV = more consistent = higher score.
 *
 * score = 1 / (1 + CV)
 *
 * For agents with 0-1 verifications, returns a neutral score.
 *
 * @param verifications - Sorted verification records (chronological)
 * @returns Consistency score (0.0 to 1.0)
 */
function verificationConsistency(
  verifications: readonly VerificationRecord[],
): number {
  const verified = verifications
    .filter((v) => v.status === 'VERIFIED')
    .map((v) => new Date(v.createdAt).getTime() / 1000)
    .sort((a, b) => a - b);

  if (verified.length <= 1) {
    // Can't measure consistency with < 2 data points
    // Return neutral score (not penalizing new agents)
    return NEW_AGENT_BASE_SCORE;
  }

  // Calculate intervals between consecutive verifications
  const intervals: number[] = [];
  for (let i = 1; i < verified.length; i++) {
    intervals.push(verified[i] - verified[i - 1]);
  }

  // Calculate mean and standard deviation of intervals
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (mean === 0) return 1.0; // All at the same time — treat as consistent

  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation
  const cv = stdDev / mean;

  // Score: 1 / (1 + CV) — perfect consistency → 1.0, high variance → approaches 0
  return 1 / (1 + cv);
}

/**
 * Calculates account age score.
 *
 * Linear ramp from 0 to 1.0 over MATURE_ACCOUNT_DAYS.
 *
 * @param agent - Agent data
 * @param nowTimestamp - Current Unix timestamp
 * @returns Account age score (0.0 to 1.0)
 */
function accountAgeScore(agent: AgentData, nowTimestamp: number): number {
  const createdAtTime = new Date(agent.createdAt).getTime() / 1000;
  const ageDays = Math.max(0, (nowTimestamp - createdAtTime) / 86400);

  // Linear ramp capped at 1.0
  return Math.min(ageDays / MATURE_ACCOUNT_DAYS, 1.0);
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the history component of the trust score.
 *
 * @param agent - Agent data
 * @param verifications - Verification records for this agent
 * @param config - Engine configuration
 * @returns HistoryComponentScore with full breakdown
 *
 * @example
 * ```ts
 * const score = calculateHistoryScore(agent, verifications, config);
 * // New agent: score.raw ≈ 3 (base score for cold start)
 * // Veteran agent: score.raw ≈ 8-10 (many verifications, consistent, old account)
 * ```
 */
export function calculateHistoryScore(
  agent: AgentData,
  verifications: readonly VerificationRecord[],
  config: TrustScoreConfig,
): HistoryComponentScore {
  const maxPoints = config.weights.history;

  const successfulVerifications = verifications.filter(
    (v) => v.status === 'VERIFIED',
  );
  const verificationCount = successfulVerifications.length;

  // --- Sub-component 1: Verification count ---
  const countScore = verificationCountScore(verificationCount);

  // --- Sub-component 2: Verification consistency ---
  const consistencyScore = verificationConsistency(verifications);

  // --- Sub-component 3: Account age ---
  const ageScore = accountAgeScore(agent, config.nowTimestamp);

  // New agent floor: even with 0 verifications, give a small base
  const isNewAgent = verificationCount === 0;
  const effectiveCountScore = isNewAgent ? NEW_AGENT_BASE_SCORE : countScore;

  // Weighted combination
  const combined =
    effectiveCountScore * VERIFICATION_COUNT_WEIGHT +
    consistencyScore * CONSISTENCY_WEIGHT +
    ageScore * ACCOUNT_AGE_WEIGHT;

  const raw = Math.round(combined * maxPoints * 100) / 100;
  const finalRaw = Math.min(raw, maxPoints);

  // Calculate days since last verification
  let daysSinceLastVerification = Infinity;
  if (successfulVerifications.length > 0) {
    const mostRecentTime = Math.max(
      ...successfulVerifications.map(
        (v) => new Date(v.createdAt).getTime() / 1000,
      ),
    );
    daysSinceLastVerification = Math.round(
      (config.nowTimestamp - mostRecentTime) / 86400,
    );
  }

  const factors: ScoreFactor[] = [
    {
      name: 'verification_count',
      inputValue: verificationCount,
      contribution:
        Math.round(effectiveCountScore * VERIFICATION_COUNT_WEIGHT * maxPoints * 100) / 100,
      description: isNewAgent
        ? `No verifications yet (base score: ${(NEW_AGENT_BASE_SCORE * 100).toFixed(0)}%)`
        : `${verificationCount} successful verification(s) (log-scaled: ${(countScore * 100).toFixed(1)}%)`,
    },
    {
      name: 'verification_consistency',
      inputValue: verificationCount <= 1 ? 'N/A' : `${(consistencyScore * 100).toFixed(1)}%`,
      contribution:
        Math.round(consistencyScore * CONSISTENCY_WEIGHT * maxPoints * 100) / 100,
      description:
        verificationCount <= 1
          ? 'Not enough data for consistency measurement (neutral score applied)'
          : `Verification interval consistency: ${(consistencyScore * 100).toFixed(1)}%`,
    },
    {
      name: 'account_age',
      inputValue: Math.round(
        (config.nowTimestamp - new Date(agent.createdAt).getTime() / 1000) / 86400,
      ),
      contribution: Math.round(ageScore * ACCOUNT_AGE_WEIGHT * maxPoints * 100) / 100,
      description: `Account age: ${Math.round((config.nowTimestamp - new Date(agent.createdAt).getTime() / 1000) / 86400)} days (${(ageScore * 100).toFixed(1)}% of mature threshold)`,
    },
  ];

  return {
    raw: Math.round(finalRaw * 100) / 100,
    max: maxPoints,
    normalized: Math.round((finalRaw / maxPoints) * 10000) / 10000,
    explanation: `${verificationCount} verifications, consistency ${(consistencyScore * 100).toFixed(0)}%. History: ${finalRaw.toFixed(2)}/${maxPoints}`,
    factors,
    verificationCount,
    daysSinceLastVerification,
  };
}
