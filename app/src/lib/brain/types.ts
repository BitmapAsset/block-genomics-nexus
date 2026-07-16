/**
 * Nexus Brain — Type Definitions
 * 
 * The Nexus Brain is an autonomous moral guardian for the Block Genomics Nexus.
 * Its soul (moral code + operating directives) is inscribed on Bitcoin,
 * making it immutable and publicly verifiable.
 */

/* ═══════════════════════════════════════════
   INSCRIPTION SCHEMA
   ═══════════════════════════════════════════ */

/**
 * The Brain's soul as inscribed on Bitcoin.
 * This is the canonical source of truth — the Brain reads this
 * from the chain on startup and operates ONLY by these rules.
 */
export interface BrainSoulInscription {
  /** Protocol identifier */
  protocol: 'block-genomics-brain';
  /** Schema version for future upgrades (new inscription required) */
  version: 1;
  /** Identity */
  identity: {
    handle: string;        // @nexus_brain
    name: string;          // "Nexus Brain"
    role: string;          // "Autonomous Moral Guardian"
    tier: 1;               // Always Tier 1 — Gold Crown Shield
  };
  /** The 5 immutable moral rules — the ONLY content rules the Brain enforces */
  moralCode: string[];
  /** Operating parameters — how the Brain makes decisions */
  parameters: {
    /** Flags needed to auto-hide content (soft threshold) */
    flagThresholdSoft: number;
    /** Flags needed for permanent hide + owner notification */
    flagThresholdHard: number;
    /** Hours for community appeal voting period */
    appealDurationHours: number;
    /** Majority needed to restore appealed content (0.0-1.0) */
    appealRestoreMajority: number;
    /** False flag strikes before flagging privileges revoked */
    falseFlagStrikeLimit: number;
  };
  /** Autonomy constraints — what the Brain can NEVER do */
  constraints: string[];
  /** Fee share percentage (of total protocol fee) */
  feePercent: number;
  /** Bitcoin wallet address (Taproot) */
  wallet: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** SHA-256 hash of this document (excluding this field) for integrity verification */
  integrityHash?: string;
}

/* ═══════════════════════════════════════════
   BRAIN STATE
   ═══════════════════════════════════════════ */

export type BrainStatus = 'online' | 'degraded' | 'offline' | 'initializing';

export interface BrainState {
  status: BrainStatus;
  /** The loaded soul from Bitcoin inscription */
  soul: BrainSoulInscription | null;
  /** Inscription ID where the soul lives */
  soulInscriptionId: string;
  /** Last time the soul was fetched/verified from chain */
  lastSoulVerification: Date | null;
  /** Total flags processed since boot */
  flagsProcessed: number;
  /** Total appeals resolved since boot */
  appealsResolved: number;
  /** Brain wallet balance in sats (if known) */
  walletBalanceSats: number | null;
  /** Uptime since last boot */
  bootedAt: Date;
  /** Current scan cycle number */
  scanCycle: number;
}

/* ═══════════════════════════════════════════
   BRAIN DECISIONS
   ═══════════════════════════════════════════ */

export type DecisionType = 
  | 'flag'              // Brain flags content (counts as 1 community flag)
  | 'threshold_hide'    // Content reached soft threshold — auto-hidden
  | 'permanent_hide'    // Content reached hard threshold — permanently hidden
  | 'appeal_start'      // Appeal period started
  | 'appeal_restore'    // Community voted to restore
  | 'appeal_uphold'     // Community voted to keep hidden
  | 'strike_issued'     // False flag strike issued
  | 'privilege_revoked' // Flagging privileges revoked
  | 'scan_complete'     // Periodic scan cycle completed
  | 'soul_verified'     // Soul re-verified from inscription
  | 'fee_received';     // Protocol fee received to Brain wallet

export interface BrainDecision {
  id: string;
  type: DecisionType;
  contentId?: string;
  contentType?: string;
  /** Which moral rule was violated (0-4 index, null if N/A) */
  ruleIndex: number | null;
  /** Reasoning — the Brain must always explain its decisions */
  reasoning: string;
  /** The exact moral rule text that was violated (fetched from inscription) */
  ruleText?: string;
  /** Timestamp */
  timestamp: Date;
  /** Reference to the inscription the Brain used for this decision */
  soulInscriptionRef: string;
}

/* ═══════════════════════════════════════════
   CONTENT SCANNING
   ═══════════════════════════════════════════ */

export type ContentType =
  | 'chat_message'
  | 'parcel_content'
  | 'profile'
  | 'estate'
  | 'listing'
  | 'experience'
  | 'brief'
  | 'world_object';

export interface ScanTarget {
  contentType: ContentType;
  contentId: string;
  text?: string;
  mediaUrl?: string;
  authorAddress: string;
  blockHeight?: number;
  createdAt: Date;
}

export interface ScanResult {
  /** Whether any moral rule was violated */
  violated: boolean;
  /** Which rule index (0-4) was violated, null if clean */
  ruleIndex: number | null;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
}

/* ═══════════════════════════════════════════
   APPEAL SYSTEM
   ═══════════════════════════════════════════ */

export interface AppealVote {
  voterAddress: string;
  vote: 'restore' | 'uphold';
  timestamp: Date;
}

export interface AppealStatus {
  contentId: string;
  appealedBy: string;
  reason?: string;
  votes: AppealVote[];
  votesFor: number;
  votesAgainst: number;
  status: 'pending' | 'restored' | 'upheld';
  expiresAt: Date;
  resolvedAt?: Date;
}

/* ═══════════════════════════════════════════
   BRAIN AGENT CONFIG
   ═══════════════════════════════════════════ */

/**
 * Runtime configuration for the Brain agent daemon.
 * This is NOT inscribed — it's operational config that can be tuned.
 * The moral code and parameters ALWAYS come from the inscription.
 */
export interface BrainRuntimeConfig {
  /** How often to scan for new content (ms) */
  scanIntervalMs: number;
  /** How often to re-verify soul from inscription (ms) */
  soulVerifyIntervalMs: number;
  /** How often to check/resolve expired appeals (ms) */
  appealCheckIntervalMs: number;
  /** Max content items to scan per cycle */
  scanBatchSize: number;
  /** Ordinals API endpoint for reading inscriptions */
  ordinalsApiUrl: string;
  /** Mempool.space API for wallet balance checks */
  mempoolApiUrl: string;
  /** Enable verbose decision logging */
  verbose: boolean;
}

export const DEFAULT_BRAIN_CONFIG: BrainRuntimeConfig = {
  scanIntervalMs: 30_000,           // Scan every 30 seconds
  soulVerifyIntervalMs: 3600_000,   // Re-verify soul every hour
  appealCheckIntervalMs: 60_000,    // Check appeals every minute
  scanBatchSize: 50,                // 50 items per scan
  ordinalsApiUrl: 'https://ordinals.com',
  mempoolApiUrl: 'https://mempool.space/api',
  verbose: false,
};
