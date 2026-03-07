/**
 * Block Genomics — Claim Bonus Component
 *
 * Calculates bonus trust points from verified external claims.
 * Claims are optional identity anchors that agents attach to their profile
 * (e.g., verified email, domain, X account, GitHub, etc.).
 *
 * Each claim type has a fixed bonus value, and the total is capped
 * at maxClaimBonus to prevent gaming through claim accumulation.
 *
 * The claim bonus is ADDED to the score after tier multiplier and
 * time decay, but before final clamping to [0, 100].
 *
 * Claim bonuses are intentionally small (2-5 points each) so that
 * the primary trust signal always comes from on-chain data.
 *
 * @module components/claim-bonus
 * @version 1.0.0
 */

import type {
  Claim,
  ClaimBonusScore,
  ScoreFactor,
  TrustScoreConfig,
} from '../types.js';
import { ClaimType } from '../types.js';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Determines if a claim is currently valid (verified and not expired).
 *
 * @param claim - The claim to check
 * @param nowTimestamp - Current Unix timestamp
 * @returns Whether the claim is valid
 */
function isClaimValid(claim: Claim, nowTimestamp: number): boolean {
  if (!claim.verified) return false;

  // Check expiration
  if (claim.expiresAt) {
    const expiresAtTime = new Date(claim.expiresAt).getTime() / 1000;
    if (nowTimestamp > expiresAtTime) return false;
  }

  return true;
}

/**
 * Returns a human-readable label for a claim type.
 *
 * @param type - Claim type enum value
 * @returns Human-readable label
 */
function claimTypeLabel(type: ClaimType): string {
  const labels: Record<ClaimType, string> = {
    [ClaimType.EMAIL]: 'Email address',
    [ClaimType.DOMAIN]: 'Domain ownership',
    [ClaimType.X_ACCOUNT]: 'X (Twitter) account',
    [ClaimType.GITHUB]: 'GitHub account',
    [ClaimType.NOSTR]: 'Nostr identity',
    [ClaimType.LIGHTNING_NODE]: 'Lightning Network node',
    [ClaimType.PGP_KEY]: 'PGP public key',
    [ClaimType.DNS_TXT]: 'DNS TXT record',
  };
  return labels[type] || type;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Calculates the claim bonus component of the trust score.
 *
 * @param claims - Array of claims attached to the agent
 * @param config - Engine configuration
 * @returns ClaimBonusScore with full breakdown
 *
 * @example
 * ```ts
 * const claims = [
 *   { type: ClaimType.DOMAIN, value: 'example.com', verified: true },
 *   { type: ClaimType.X_ACCOUNT, value: '@satoshi', verified: true },
 * ];
 * const score = calculateClaimBonus(claims, config);
 * // score.raw = 8 (domain: 5 + X: 3), capped at maxClaimBonus
 * ```
 */
export function calculateClaimBonus(
  claims: readonly Claim[],
  config: TrustScoreConfig,
): ClaimBonusScore {
  const maxPoints = config.maxClaimBonus;

  // Filter to valid (verified + not expired) claims
  const validClaims = claims.filter((c) => isClaimValid(c, config.nowTimestamp));

  // Deduplicate by type — only the first valid claim of each type counts
  const seenTypes = new Set<ClaimType>();
  const uniqueValidClaims: Claim[] = [];

  for (const claim of validClaims) {
    if (!seenTypes.has(claim.type)) {
      seenTypes.add(claim.type);
      uniqueValidClaims.push(claim);
    }
  }

  // Calculate bonus for each unique valid claim
  let totalBonus = 0;
  const factors: ScoreFactor[] = [];
  const contributingClaims: ClaimType[] = [];

  for (const claim of uniqueValidClaims) {
    const bonus = config.claimBonuses[claim.type] || 0;
    const cappedContribution = Math.min(bonus, maxPoints - totalBonus);

    if (cappedContribution > 0) {
      totalBonus += cappedContribution;
      contributingClaims.push(claim.type);

      factors.push({
        name: `claim_${claim.type}`,
        inputValue: claim.value,
        contribution: cappedContribution,
        description: `${claimTypeLabel(claim.type)}: +${cappedContribution} points (verified: ${claim.value})`,
      });
    }

    if (totalBonus >= maxPoints) break;
  }

  // Add factors for unverified claims (informational)
  const unverifiedClaims = claims.filter(
    (c) => !isClaimValid(c, config.nowTimestamp),
  );
  for (const claim of unverifiedClaims) {
    factors.push({
      name: `claim_${claim.type}_unverified`,
      inputValue: claim.value,
      contribution: 0,
      description: `${claimTypeLabel(claim.type)}: not verified or expired (${claim.value})`,
    });
  }

  const finalRaw = Math.min(totalBonus, maxPoints);

  return {
    raw: finalRaw,
    max: maxPoints,
    normalized: maxPoints > 0 ? Math.round((finalRaw / maxPoints) * 10000) / 10000 : 0,
    explanation:
      uniqueValidClaims.length > 0
        ? `${uniqueValidClaims.length} verified claim(s) contribute +${finalRaw} bonus points (max: ${maxPoints})`
        : 'No verified claims — no bonus points',
    factors,
    verifiedClaimCount: uniqueValidClaims.length,
    contributingClaims,
  };
}
