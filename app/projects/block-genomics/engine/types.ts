/**
 * Block Genomics — Trust Score Engine Types
 *
 * All TypeScript types used by the trust scoring system.
 * Strict types ensure deterministic, auditable scoring.
 *
 * @module types
 * @version 1.0.0
 */

// =============================================================================
// CORE ENUMS
// =============================================================================

/** Verification tier levels — determines trust multiplier */
export enum Tier {
  /** Block owner — full trust, 1.0x multiplier */
  TIER_1 = 1,
  /** Transaction-anchored — high trust, 0.8x multiplier */
  TIER_2 = 2,
  /** Delegated — moderate trust, 0.6x multiplier */
  TIER_3 = 3,
}

/** Claim types that can add bonus points */
export enum ClaimType {
  EMAIL = 'email',
  DOMAIN = 'domain',
  X_ACCOUNT = 'x_account',
  GITHUB = 'github',
  NOSTR = 'nostr',
  LIGHTNING_NODE = 'lightning_node',
  PGP_KEY = 'pgp_key',
  DNS_TXT = 'dns_txt',
}

/** Trust score tiers — human-readable labels */
export enum TrustTier {
  /** 90-100: Exceptional trust */
  LEGENDARY = 'legendary',
  /** 75-89: Very high trust */
  EXCELLENT = 'excellent',
  /** 60-74: Solid trust */
  GOOD = 'good',
  /** 40-59: Moderate trust */
  MODERATE = 'moderate',
  /** 20-39: Low trust */
  LOW = 'low',
  /** 0-19: Minimal trust */
  MINIMAL = 'minimal',
}

/** Anomaly severity levels */
export enum AnomalySeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// =============================================================================
// BLOCK DATA
// =============================================================================

/** Bitcoin block data as fetched from mempool.space or cached in DB */
export interface BlockData {
  /** Block height (0 = genesis) */
  readonly height: number;
  /** Block hash (64 hex chars) */
  readonly hash: string;
  /** Merkle root of transactions */
  readonly merkleRoot: string;
  /** Previous block hash */
  readonly previousHash: string;
  /** Unix timestamp of block */
  readonly timestamp: number;
  /** Mining nonce */
  readonly nonce: number;
  /** Compact target representation */
  readonly bits: string;
  /** Mining difficulty */
  readonly difficulty: number;
  /** Number of transactions in the block */
  readonly txCount: number;
  /** Block size in bytes */
  readonly size: number;
  /** Block weight in weight units */
  readonly weight: number;
  /** Optional: total output value in satoshis */
  readonly totalOutputSats?: bigint;
  /** Optional: total fees in satoshis */
  readonly totalFeeSats?: bigint;
  /** Optional: average fee rate (sat/vB) */
  readonly avgFeeRate?: number;
  /** Optional: block traits from bitmap community taxonomy */
  readonly traits?: readonly BlockTrait[];
}

/** A single block trait (from bitmap community taxonomy) */
export interface BlockTrait {
  readonly trait: string;
  readonly value: boolean | number | string;
}

// =============================================================================
// AGENT DATA
// =============================================================================

/** Agent record — a verified entity (human or AI) */
export interface AgentData {
  /** Unique agent ID (format: bg_xxxx) */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Block height this agent is verified against */
  readonly blockHeight: number;
  /** Block hash */
  readonly blockHash: string;
  /** 64 hex-char genome fingerprint */
  readonly genome: string;
  /** Verification tier (1, 2, or 3) */
  readonly tier: Tier;
  /** Whether this is an AI agent */
  readonly isAI: boolean;
  /** Wallet address used for verification */
  readonly walletAddress: string;
  /** Whether the agent has been verified */
  readonly verified: boolean;
  /** ISO timestamp of verification */
  readonly verifiedAt?: string;
  /** ISO timestamp of creation */
  readonly createdAt: string;
}

// =============================================================================
// VERIFICATION DATA
// =============================================================================

/** A single verification event */
export interface VerificationRecord {
  /** Unique verification ID */
  readonly id: string;
  /** Agent ID this verification belongs to */
  readonly agentId: string;
  /** BIP-322 signature */
  readonly signature: string;
  /** Address that signed */
  readonly signerAddress: string;
  /** Block height verified */
  readonly blockHeight: number;
  /** Status: PENDING, VERIFIED, FAILED, EXPIRED */
  readonly status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  /** ISO timestamp of creation */
  readonly createdAt: string;
  /** ISO timestamp of expiration */
  readonly expiresAt: string;
}

// =============================================================================
// CLAIMS
// =============================================================================

/** A verified claim attached to an agent */
export interface Claim {
  /** Claim type */
  readonly type: ClaimType;
  /** The claimed value (e.g., email address, domain, handle) */
  readonly value: string;
  /** Whether this claim has been verified */
  readonly verified: boolean;
  /** ISO timestamp of verification */
  readonly verifiedAt?: string;
  /** ISO timestamp when verification expires */
  readonly expiresAt?: string;
}

// =============================================================================
// TRUST SCORE COMPONENTS
// =============================================================================

/** Score for a single component with metadata */
export interface ComponentScore {
  /** Raw score before tier multiplier (0 to max) */
  readonly raw: number;
  /** Maximum possible score for this component */
  readonly max: number;
  /** Normalized score (0.0 to 1.0) */
  readonly normalized: number;
  /** Human-readable explanation */
  readonly explanation: string;
  /** Detailed breakdown factors */
  readonly factors: readonly ScoreFactor[];
}

/** A single factor contributing to a component score */
export interface ScoreFactor {
  /** Factor name (e.g., "block_age_years") */
  readonly name: string;
  /** Raw input value */
  readonly inputValue: number | string;
  /** Contribution to the component score */
  readonly contribution: number;
  /** Human-readable description */
  readonly description: string;
}

/** Age component score with extra metadata */
export interface AgeComponentScore extends ComponentScore {
  /** Block age in years */
  readonly ageYears: number;
  /** Which Bitcoin era this block belongs to */
  readonly era: string;
}

/** Richness component score with extra metadata */
export interface RichnessComponentScore extends ComponentScore {
  /** Transaction count in the block */
  readonly txCount: number;
  /** Block size in bytes */
  readonly blockSize: number;
  /** Total output value (if available) */
  readonly totalOutputSats?: bigint;
}

/** Security component score with extra metadata */
export interface SecurityComponentScore extends ComponentScore {
  /** Mining difficulty */
  readonly difficulty: number;
  /** Number of leading zero bits in block hash */
  readonly leadingZeroBits: number;
}

/** Ownership component score with extra metadata */
export interface OwnershipComponentScore extends ComponentScore {
  /** Whether a bitmap inscription was detected */
  readonly bitmapDetected: boolean;
  /** Whether BIP-322 signature was verified */
  readonly signatureVerified: boolean;
}

/** History component score with extra metadata */
export interface HistoryComponentScore extends ComponentScore {
  /** Number of successful verifications */
  readonly verificationCount: number;
  /** Days since last verification */
  readonly daysSinceLastVerification: number;
}

/** Claim bonus score with extra metadata */
export interface ClaimBonusScore extends ComponentScore {
  /** Number of verified claims */
  readonly verifiedClaimCount: number;
  /** List of claim types that contributed */
  readonly contributingClaims: readonly ClaimType[];
}

// =============================================================================
// TRUST SCORE OUTPUT
// =============================================================================

/** Complete trust score breakdown */
export interface TrustScore {
  /** Final composite score (0-100, integer) */
  readonly score: number;
  /** Human-readable trust tier */
  readonly tier: TrustTier;
  /** Agent's verification tier (1, 2, or 3) */
  readonly verificationTier: Tier;
  /** Tier multiplier applied (1.0, 0.8, or 0.6) */
  readonly tierMultiplier: number;

  /** Component scores */
  readonly components: {
    readonly age: AgeComponentScore;
    readonly richness: RichnessComponentScore;
    readonly security: SecurityComponentScore;
    readonly ownership: OwnershipComponentScore;
    readonly history: HistoryComponentScore;
    readonly claimBonus: ClaimBonusScore;
  };

  /** Pre-multiplier subtotal (sum of components) */
  readonly rawTotal: number;
  /** Post-multiplier, pre-decay score */
  readonly multipliedTotal: number;
  /** Time decay penalty applied */
  readonly decayPenalty: number;
  /** Claim bonus added */
  readonly claimBonusTotal: number;

  /** Anomaly flags (if any suspicious patterns detected) */
  readonly anomalies: readonly Anomaly[];
  /** Whether any critical anomalies were detected */
  readonly flagged: boolean;

  /** ISO timestamp of when this score was calculated */
  readonly calculatedAt: string;
  /** Engine version that produced this score */
  readonly engineVersion: string;
}

/** An anomaly flag on a trust score */
export interface Anomaly {
  /** Anomaly code (machine-readable) */
  readonly code: string;
  /** Severity level */
  readonly severity: AnomalySeverity;
  /** Human-readable message */
  readonly message: string;
  /** Which component triggered this */
  readonly component: string;
}

// =============================================================================
// ENGINE CONFIGURATION
// =============================================================================

/** Configuration for the TrustScoreEngine */
export interface TrustScoreConfig {
  /** Component weights (must sum to 100) */
  readonly weights: {
    readonly age: number;
    readonly richness: number;
    readonly security: number;
    readonly ownership: number;
    readonly history: number;
  };

  /** Tier multipliers */
  readonly tierMultipliers: {
    readonly [Tier.TIER_1]: number;
    readonly [Tier.TIER_2]: number;
    readonly [Tier.TIER_3]: number;
  };

  /** Claim bonus points by type */
  readonly claimBonuses: {
    readonly [key in ClaimType]: number;
  };

  /** Maximum total claim bonus points */
  readonly maxClaimBonus: number;

  /** Time decay configuration */
  readonly decay: {
    /** Days before decay starts */
    readonly gracePeriodDays: number;
    /** Maximum decay penalty (points) */
    readonly maxDecayPenalty: number;
    /** Decay rate per day after grace period */
    readonly decayRatePerDay: number;
  };

  /** Current Bitcoin block height (for age calculations) */
  readonly currentBlockHeight: number;

  /** Current Unix timestamp (for deterministic testing) */
  readonly nowTimestamp: number;
}

// =============================================================================
// ENGINE INPUT
// =============================================================================

/** All inputs needed to calculate a trust score */
export interface TrustScoreInput {
  readonly agent: AgentData;
  readonly block: BlockData;
  readonly verifications: readonly VerificationRecord[];
  readonly claims: readonly Claim[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default engine configuration */
export const DEFAULT_CONFIG: TrustScoreConfig = {
  weights: {
    age: 25,
    richness: 25,
    security: 20,
    ownership: 20,
    history: 10,
  },
  tierMultipliers: {
    [Tier.TIER_1]: 1.0,
    [Tier.TIER_2]: 0.8,
    [Tier.TIER_3]: 0.6,
  },
  claimBonuses: {
    [ClaimType.EMAIL]: 2,
    [ClaimType.DOMAIN]: 5,
    [ClaimType.X_ACCOUNT]: 3,
    [ClaimType.GITHUB]: 3,
    [ClaimType.NOSTR]: 2,
    [ClaimType.LIGHTNING_NODE]: 4,
    [ClaimType.PGP_KEY]: 3,
    [ClaimType.DNS_TXT]: 4,
  },
  maxClaimBonus: 15,
  decay: {
    gracePeriodDays: 90,
    maxDecayPenalty: 20,
    decayRatePerDay: 0.1,
  },
  currentBlockHeight: 880000,
  nowTimestamp: Math.floor(Date.now() / 1000),
} as const;

/** Bitcoin genesis block timestamp (Jan 3, 2009 18:15:05 UTC) */
export const GENESIS_TIMESTAMP = 1231006505;

/** Average seconds per Bitcoin block (~10 minutes) */
export const AVG_BLOCK_INTERVAL_SECONDS = 600;

/** Halving interval in blocks */
export const HALVING_INTERVAL = 210_000;

/** Maximum block size in bytes (4MB weight limit) */
export const MAX_BLOCK_WEIGHT = 4_000_000;

/** Engine version string */
export const ENGINE_VERSION = '1.0.0';
