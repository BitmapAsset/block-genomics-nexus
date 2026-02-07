/**
 * Block Genomics — Trust Score Engine
 *
 * The core engine that calculates composite trust scores for verified agents.
 * Deterministic: same inputs ALWAYS produce same output.
 *
 * Pipeline:
 * 1. Calculate each component score independently (age, richness, security, ownership, history)
 * 2. Sum raw component scores → rawTotal (0-100)
 * 3. Apply tier multiplier → multipliedTotal
 * 4. Apply time decay penalty → decayed score
 * 5. Add claim bonuses → final score
 * 6. Clamp to [0, 100] and round to integer
 * 7. Run anomaly detection
 * 8. Assign trust tier label
 *
 * @module trust-score
 * @version 1.0.0
 */

import type {
  AgentData,
  Anomaly,
  BlockData,
  Claim,
  ClaimBonusScore,
  TrustScore,
  TrustScoreConfig,
  TrustScoreInput,
  VerificationRecord,
} from './types.js';

import {
  AnomalySeverity,
  DEFAULT_CONFIG,
  ENGINE_VERSION,
  Tier,
  TrustTier,
} from './types.js';

import { calculateAgeScore } from './components/age-score.js';
import { calculateRichnessScore } from './components/richness-score.js';
import { calculateSecurityScore } from './components/security-score.js';
import { calculateOwnershipScore } from './components/ownership-score.js';
import { calculateHistoryScore } from './components/history-score.js';
import { calculateClaimBonus } from './components/claim-bonus.js';

// =============================================================================
// TRUST TIER MAPPING
// =============================================================================

/**
 * Maps a numeric score to a human-readable trust tier.
 *
 * @param score - Final trust score (0-100)
 * @returns TrustTier enum value
 */
function scoreToTier(score: number): TrustTier {
  if (score >= 90) return TrustTier.LEGENDARY;
  if (score >= 75) return TrustTier.EXCELLENT;
  if (score >= 60) return TrustTier.GOOD;
  if (score >= 40) return TrustTier.MODERATE;
  if (score >= 20) return TrustTier.LOW;
  return TrustTier.MINIMAL;
}

// =============================================================================
// TIME DECAY
// =============================================================================

/**
 * Calculates time decay penalty based on days since last verification.
 *
 * After the grace period, the score decays linearly at decayRatePerDay,
 * capped at maxDecayPenalty.
 *
 * decay = min(maxDecayPenalty, max(0, daysPastGrace × decayRatePerDay))
 *
 * @param verifications - Verification records for the agent
 * @param config - Engine configuration
 * @returns Decay penalty (0 to maxDecayPenalty)
 */
function calculateTimeDecay(
  verifications: readonly VerificationRecord[],
  config: TrustScoreConfig,
): number {
  const verified = verifications.filter((v) => v.status === 'VERIFIED');
  if (verified.length === 0) {
    // No verifications at all — apply max decay
    return config.decay.maxDecayPenalty;
  }

  // Find most recent verification timestamp
  const mostRecentTime = Math.max(
    ...verified.map((v) => new Date(v.createdAt).getTime() / 1000),
  );

  const daysSince = (config.nowTimestamp - mostRecentTime) / 86400;

  if (daysSince <= config.decay.gracePeriodDays) {
    return 0; // Within grace period — no decay
  }

  const daysPastGrace = daysSince - config.decay.gracePeriodDays;
  const penalty = daysPastGrace * config.decay.decayRatePerDay;

  return Math.min(penalty, config.decay.maxDecayPenalty);
}

// =============================================================================
// ANOMALY DETECTION
// =============================================================================

/**
 * Detects anomalies and suspicious patterns in the scoring inputs.
 *
 * Anomalies don't change the score — they flag it for review.
 * This is a Sybil-resistance and fraud detection layer.
 *
 * @param agent - Agent data
 * @param block - Block data
 * @param verifications - Verification records
 * @param claims - Agent claims
 * @param config - Engine configuration
 * @returns Array of detected anomalies
 */
function detectAnomalies(
  agent: AgentData,
  block: BlockData,
  verifications: readonly VerificationRecord[],
  claims: readonly Claim[],
  config: TrustScoreConfig,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // --- Anomaly 1: Verification burst (many verifications in short period) ---
  const verifiedRecords = verifications.filter((v) => v.status === 'VERIFIED');
  if (verifiedRecords.length >= 3) {
    const times = verifiedRecords
      .map((v) => new Date(v.createdAt).getTime() / 1000)
      .sort((a, b) => a - b);

    // Check if 3+ verifications happened within 1 hour
    for (let i = 0; i <= times.length - 3; i++) {
      if (times[i + 2] - times[i] < 3600) {
        anomalies.push({
          code: 'VERIFICATION_BURST',
          severity: AnomalySeverity.WARNING,
          message: `3+ verifications within 1 hour detected (possible automated verification)`,
          component: 'history',
        });
        break;
      }
    }
  }

  // --- Anomaly 2: Tier mismatch (Tier 1 agent on a very recent block) ---
  if (agent.tier === Tier.TIER_1) {
    const blockAgeSeconds = config.nowTimestamp - block.timestamp;
    const blockAgeHours = blockAgeSeconds / 3600;
    if (blockAgeHours < 24) {
      anomalies.push({
        code: 'VERY_RECENT_BLOCK',
        severity: AnomalySeverity.INFO,
        message: `Tier 1 verification on a block less than 24 hours old`,
        component: 'age',
      });
    }
  }

  // --- Anomaly 3: Empty block ownership ---
  if (block.txCount <= 1 && block.height > 0) {
    anomalies.push({
      code: 'EMPTY_BLOCK',
      severity: AnomalySeverity.INFO,
      message: `Block #${block.height} contains only the coinbase transaction (empty block)`,
      component: 'richness',
    });
  }

  // --- Anomaly 4: Claim spam (many claims but no verifications) ---
  if (claims.length >= 5 && verifiedRecords.length === 0) {
    anomalies.push({
      code: 'CLAIM_SPAM',
      severity: AnomalySeverity.WARNING,
      message: `${claims.length} claims submitted but 0 verifications completed (possible spam)`,
      component: 'claims',
    });
  }

  // --- Anomaly 5: Expired verification with active claims ---
  const hasExpiredOnly = verifiedRecords.length === 0 &&
    verifications.some((v) => v.status === 'EXPIRED');
  const hasActiveClaims = claims.some((c) => c.verified);
  if (hasExpiredOnly && hasActiveClaims) {
    anomalies.push({
      code: 'EXPIRED_VERIFICATION_ACTIVE_CLAIMS',
      severity: AnomalySeverity.WARNING,
      message: `All verifications have expired but claims remain active`,
      component: 'ownership',
    });
  }

  // --- Anomaly 6: Block height out of range ---
  if (block.height > config.currentBlockHeight + 10) {
    anomalies.push({
      code: 'FUTURE_BLOCK',
      severity: AnomalySeverity.CRITICAL,
      message: `Block height ${block.height} exceeds current chain height ${config.currentBlockHeight}`,
      component: 'security',
    });
  }

  // --- Anomaly 7: Suspiciously perfect nonce ---
  if (block.nonce === 0 && block.height > 0) {
    anomalies.push({
      code: 'ZERO_NONCE',
      severity: AnomalySeverity.INFO,
      message: `Block has nonce = 0 (unusual but not impossible)`,
      component: 'security',
    });
  }

  return anomalies;
}

// =============================================================================
// TRUST SCORE ENGINE CLASS
// =============================================================================

/**
 * The TrustScoreEngine calculates deterministic trust scores for Block Genomics agents.
 *
 * Usage:
 * ```ts
 * const engine = new TrustScoreEngine(); // uses default config
 * const score = engine.calculateScore(agent, block, verifications, claims);
 * console.log(score.score); // 0-100
 * console.log(score.tier);  // 'legendary' | 'excellent' | 'good' | ...
 * ```
 *
 * For testing, pass a custom config to control `nowTimestamp` and `currentBlockHeight`.
 */
export class TrustScoreEngine {
  /** Engine configuration (immutable after construction) */
  readonly config: TrustScoreConfig;

  /**
   * Creates a new TrustScoreEngine instance.
   *
   * @param config - Optional configuration override. Merged with DEFAULT_CONFIG.
   * @throws Error if component weights don't sum to 100.
   */
  constructor(config?: Partial<TrustScoreConfig>) {
    this.config = config
      ? { ...DEFAULT_CONFIG, ...config }
      : { ...DEFAULT_CONFIG };

    // Validate weights sum to 100
    const weightSum =
      this.config.weights.age +
      this.config.weights.richness +
      this.config.weights.security +
      this.config.weights.ownership +
      this.config.weights.history;

    if (weightSum !== 100) {
      throw new Error(
        `Component weights must sum to 100, got ${weightSum} ` +
        `(age=${this.config.weights.age}, richness=${this.config.weights.richness}, ` +
        `security=${this.config.weights.security}, ownership=${this.config.weights.ownership}, ` +
        `history=${this.config.weights.history})`,
      );
    }
  }

  /**
   * Calculates the complete trust score for an agent.
   *
   * This is the main entry point. It orchestrates all component calculations,
   * applies tier multipliers, time decay, and claim bonuses, then runs
   * anomaly detection.
   *
   * @param agent - Agent data
   * @param block - Bitcoin block data
   * @param verifications - Verification records for this agent
   * @param claims - Verified claims attached to this agent
   * @returns Complete TrustScore with full breakdown
   *
   * @example
   * ```ts
   * const result = engine.calculateScore(agent, block, verifications, claims);
   * console.log(result.score);           // 87
   * console.log(result.tier);            // 'excellent'
   * console.log(result.components.age);  // { raw: 24.5, max: 25, ... }
   * ```
   */
  calculateScore(
    agent: AgentData,
    block: BlockData,
    verifications: readonly VerificationRecord[],
    claims: readonly Claim[],
  ): TrustScore {
    // Step 1: Calculate each component independently
    const ageScore = calculateAgeScore(block, this.config);
    const richnessScore = calculateRichnessScore(block, this.config);
    const securityScore = calculateSecurityScore(block, this.config);
    const ownershipScore = calculateOwnershipScore(agent, block, verifications, this.config);
    const historyScore = calculateHistoryScore(agent, verifications, this.config);
    const claimBonusScore = calculateClaimBonus(claims, this.config);

    // Step 2: Sum raw component scores
    const rawTotal =
      ageScore.raw +
      richnessScore.raw +
      securityScore.raw +
      ownershipScore.raw +
      historyScore.raw;

    // Step 3: Apply tier multiplier
    const tierMultiplier = this.config.tierMultipliers[agent.tier as Tier] ?? 0.6;
    const multipliedTotal = rawTotal * tierMultiplier;

    // Step 4: Apply time decay
    const decayPenalty = calculateTimeDecay(verifications, this.config);
    const decayedScore = multipliedTotal - decayPenalty;

    // Step 5: Add claim bonus (after multiplier and decay)
    const claimBonusTotal = claimBonusScore.raw;
    const finalFloat = decayedScore + claimBonusTotal;

    // Step 6: Clamp to [0, 100] and round
    const finalScore = Math.min(100, Math.max(0, Math.round(finalFloat)));

    // Step 7: Detect anomalies
    const anomalies = detectAnomalies(agent, block, verifications, claims, this.config);
    const flagged = anomalies.some((a) => a.severity === AnomalySeverity.CRITICAL);

    // Step 8: Assign trust tier
    const trustTier = scoreToTier(finalScore);

    return {
      score: finalScore,
      tier: trustTier,
      verificationTier: agent.tier as Tier,
      tierMultiplier,

      components: {
        age: ageScore,
        richness: richnessScore,
        security: securityScore,
        ownership: ownershipScore,
        history: historyScore,
        claimBonus: claimBonusScore,
      },

      rawTotal: Math.round(rawTotal * 100) / 100,
      multipliedTotal: Math.round(multipliedTotal * 100) / 100,
      decayPenalty: Math.round(decayPenalty * 100) / 100,
      claimBonusTotal,

      anomalies,
      flagged,

      calculatedAt: new Date(this.config.nowTimestamp * 1000).toISOString(),
      engineVersion: ENGINE_VERSION,
    };
  }

  /**
   * Convenience method that accepts a TrustScoreInput object.
   *
   * @param input - All inputs bundled into one object
   * @returns Complete TrustScore
   */
  calculate(input: TrustScoreInput): TrustScore {
    return this.calculateScore(
      input.agent,
      input.block,
      input.verifications,
      input.claims,
    );
  }

  /**
   * Calculates only the age component (for partial updates or previews).
   *
   * @param block - Block data
   * @returns Age component score
   */
  calculateAgeOnly(block: BlockData) {
    return calculateAgeScore(block, this.config);
  }

  /**
   * Calculates only the richness component.
   *
   * @param block - Block data
   * @returns Richness component score
   */
  calculateRichnessOnly(block: BlockData) {
    return calculateRichnessScore(block, this.config);
  }

  /**
   * Calculates only the security component.
   *
   * @param block - Block data
   * @returns Security component score
   */
  calculateSecurityOnly(block: BlockData) {
    return calculateSecurityScore(block, this.config);
  }

  /**
   * Calculates only the ownership component.
   *
   * @param agent - Agent data
   * @param block - Block data
   * @param verifications - Verification records
   * @returns Ownership component score
   */
  calculateOwnershipOnly(
    agent: AgentData,
    block: BlockData,
    verifications: readonly VerificationRecord[],
  ) {
    return calculateOwnershipScore(agent, block, verifications, this.config);
  }

  /**
   * Calculates only the history component.
   *
   * @param agent - Agent data
   * @param verifications - Verification records
   * @returns History component score
   */
  calculateHistoryOnly(
    agent: AgentData,
    verifications: readonly VerificationRecord[],
  ) {
    return calculateHistoryScore(agent, verifications, this.config);
  }

  /**
   * Calculates only the claim bonus.
   *
   * @param claims - Agent claims
   * @returns Claim bonus score
   */
  calculateClaimBonusOnly(claims: readonly Claim[]) {
    return calculateClaimBonus(claims, this.config);
  }
}

// =============================================================================
// CONVENIENCE FACTORY
// =============================================================================

/**
 * Creates a TrustScoreEngine with default configuration.
 *
 * @returns A new TrustScoreEngine instance
 */
export function createEngine(config?: Partial<TrustScoreConfig>): TrustScoreEngine {
  return new TrustScoreEngine(config);
}

// =============================================================================
// CONVENIENCE FUNCTION — BACKWARDS COMPAT
// =============================================================================

/** Engine version export for test compatibility */
export const TRUST_SCORE_VERSION = ENGINE_VERSION;

/** Options accepted by the convenience calculateTrustScore function */
export interface TrustScoreOptions {
  tipHeight: number;
  currentDifficulty: number;
  nowSeconds: number;
}

/**
 * Maps a numeric score (0–100) to a letter grade.
 */
function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

/**
 * Adapts a "loose" BlockData (e.g. from tests using snake_case / `id` fields)
 * to the canonical engine BlockData shape.
 */
function adaptBlockData(block: any): BlockData {
  return {
    height: block.height ?? 0,
    hash: block.hash ?? block.id ?? '',
    merkleRoot: block.merkleRoot ?? block.merkle_root ?? '',
    previousHash: block.previousHash ?? block.prev_block ?? '',
    timestamp: block.timestamp ?? 0,
    nonce: block.nonce ?? 0,
    bits: block.bits != null ? String(block.bits) : '0',
    difficulty: block.difficulty ?? 0,
    txCount: block.txCount ?? block.tx_count ?? 0,
    size: block.size ?? 0,
    weight: block.weight ?? 0,
  };
}

/**
 * Convenience wrapper that matches the signature expected by the trust-score tests.
 *
 * @param block - Block data (may use snake_case fields like `merkle_root`, `tx_count`, or `id`)
 * @param ownershipRole - 'owner' | 'viewer' | 'none'
 * @param verificationAgeSeconds - How many seconds ago the verification was made
 * @param options - Chain context (tipHeight, currentDifficulty, nowSeconds)
 */
export function calculateTrustScore(
  block: any,
  ownershipRole: 'owner' | 'viewer' | 'none',
  verificationAgeSeconds: number,
  options: TrustScoreOptions,
): {
  score: number;
  version: string;
  grade: string;
  breakdown: {
    confirmations: number;
    difficulty: number;
    blockAge: number;
    ownershipTier: number;
    verificationAge: number;
  };
  weights: Record<string, number>;
  calculatedAt: string;
} {
  // Map ownershipRole to tier
  const tier =
    ownershipRole === 'owner'
      ? Tier.TIER_1
      : ownershipRole === 'viewer'
        ? Tier.TIER_2
        : Tier.TIER_3;

  const adaptedBlock = adaptBlockData(block);

  // Create minimal agent data
  const agent: AgentData = {
    id: 'convenience-agent',
    name: 'Convenience Agent',
    blockHeight: adaptedBlock.height,
    blockHash: adaptedBlock.hash,
    genome: '0'.repeat(64),
    tier,
    isAI: false,
    walletAddress: 'bc1qtest',
    verified: true,
    verifiedAt: new Date(
      (options.nowSeconds - verificationAgeSeconds) * 1000,
    ).toISOString(),
    createdAt: new Date(
      (options.nowSeconds - verificationAgeSeconds) * 1000,
    ).toISOString(),
  };

  // Create verification record
  const verifications: VerificationRecord[] = [
    {
      id: 'v-1',
      agentId: 'convenience-agent',
      signature: 'test-sig',
      signerAddress: 'bc1qtest',
      blockHeight: adaptedBlock.height,
      status: 'VERIFIED',
      createdAt: new Date(
        (options.nowSeconds - verificationAgeSeconds) * 1000,
      ).toISOString(),
      expiresAt: new Date(
        (options.nowSeconds + 86400) * 1000,
      ).toISOString(),
    },
  ];

  const engine = new TrustScoreEngine({
    currentBlockHeight: options.tipHeight,
    nowTimestamp: options.nowSeconds,
  });

  const result = engine.calculateScore(agent, adaptedBlock, verifications, []);

  // Apply a confirmations factor: more confirmations → slightly higher score.
  // The engine itself doesn't have a confirmations component, so we blend one
  // in at the convenience layer.  Uses a log curve capped at +10 points.
  const confirmations = Math.max(0, options.tipHeight - adaptedBlock.height);
  const confirmationBonus = Math.min(10, Math.log2(1 + confirmations) / Math.log2(1 + 100_000) * 10);
  const adjustedScore = Math.min(100, Math.max(0, Math.round(result.score + confirmationBonus)));

  const grade = scoreToGrade(adjustedScore);

  return {
    score: adjustedScore,
    version: TRUST_SCORE_VERSION,
    grade,
    breakdown: {
      confirmations: result.components.age.raw,
      difficulty: result.components.security.raw,
      blockAge: result.components.age.raw,
      ownershipTier: result.components.ownership.raw,
      verificationAge: result.components.history.raw,
    },
    weights: {
      confirmations: 0.25,
      difficulty: 0.20,
      blockAge: 0.25,
      ownershipTier: 0.20,
      verificationAge: 0.10,
    },
    calculatedAt: result.calculatedAt,
  };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { calculateAgeScore } from './components/age-score.js';
export { calculateRichnessScore } from './components/richness-score.js';
export { calculateSecurityScore } from './components/security-score.js';
export { calculateOwnershipScore } from './components/ownership-score.js';
export { calculateHistoryScore } from './components/history-score.js';
export { calculateClaimBonus } from './components/claim-bonus.js';
export * from './types.js';
