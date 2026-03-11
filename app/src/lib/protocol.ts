/**
 * Block Genomics Protocol Constants
 * 
 * Core protocol configuration for the Block Genomics verification
 * and delegation system built on Bitcoin/Bitmap.
 */

/* ═══════════════════════════════════════════
   SPATIAL PROTOCOL — BLOCK DIMENSIONS
   ═══════════════════════════════════════════ */

/**
 * Each Bitcoin block (Bitmap) is exactly 2.1km × 2.1km in real-world spatial scale.
 * This is a PROTOCOL RULE — immutable and consistent across all experiences (2D, 3D, VR, AR).
 * All objects, buildings, avatars, and artifacts placed on parcels MUST respect this scale.
 * Human avatar ≈ 1.8m tall. Parcels subdivide the 2.1km² block proportionally by vbytes.
 */
export const BLOCK_SIZE_METERS = 2100; // 2.1km per side
export const BLOCK_AREA_SQ_METERS = BLOCK_SIZE_METERS * BLOCK_SIZE_METERS; // 4,410,000 m²
export const HUMAN_AVATAR_HEIGHT_METERS = 1.8;

/* ═══════════════════════════════════════════
   PROTOCOL FEE ADDRESS
   ═══════════════════════════════════════════ */

/** 
 * Block Genomics protocol fee collection address (Taproot P2TR)
 * All protocol fees from Tier 3 delegations flow here.
 */
export const PROTOCOL_FEE_ADDRESS = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

/** Protocol fee percentage (3% of delegation rental fee) */
export const PROTOCOL_FEE_PERCENT = 3; // Split: 2.5% treasury + 0.5% Nexus Brain

/** Owner share percentage (97% of delegation rental fee) */
export const OWNER_SHARE_PERCENT = 97;

// ─── Nexus Brain: Autonomous Moral Guardian ───
export const NEXUS_BRAIN_HANDLE = 'nexus_brain';
export const NEXUS_BRAIN_WALLET = 'bc1p6gnhrkmxfggytctzyq6qsenkzjlvkdapmap73guy5g8kuvtkwjzq7xpr4d';
export const BRAIN_FEE_PERCENT = 0.5; // 0.5% of protocol fees fund the Brain
export const PROTOCOL_TREASURY_PERCENT = 2.5; // Remaining 2.5% to treasury (was 3%)

// Content Moderation Thresholds (immutable once deployed)
export const FLAG_THRESHOLD_SOFT = 10; // Auto-hide content
export const FLAG_THRESHOLD_HARD = 25; // Permanent hide + owner notified
export const APPEAL_DURATION_HOURS = 48; // Hours for community vote on appeal
export const APPEAL_RESTORE_MAJORITY = 0.6; // 60% vote needed to restore
export const FALSE_FLAG_STRIKE_LIMIT = 3; // Strikes before flagging privileges revoked
export const AGENT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24hr between registrations

// The 5 Immutable Moral Rules
export const MORAL_CODE = [
  'No exploitation of minors — zero tolerance',
  'No direct threats of violence',
  'No doxxing (sharing private info without consent)',
  'No fraud/scam content designed to steal',
  'No impersonation of verified identities',
] as const;
export const MORAL_CODE_INSCRIPTION_ID = '119366628'; // Inscribed on Bitcoin — permanent
export const SOUL_TEXT_INSCRIPTION_ID = '119366684'; // Soul as text — inscribed on Bitcoin
export const SOUL_FILE_INSCRIPTION_ID = '119366692'; // SOUL.md file — inscribed on Bitcoin
export const SOUL_JSON_INSCRIPTION_ID = '75abd6987e756f042e1ac5e714169e35f5086993bd176eac3156abc9e118291fi0'; // SOUL.json — full autonomous agent schema
export const SOUL_JSON_INSCRIPTION_NUMBER = 119380336;

/* ═══════════════════════════════════════════
   TIER SYSTEM
   ═══════════════════════════════════════════ */

export enum VerificationTier {
  /** Block owner — owns the bitmap (parent inscription) */
  TIER_1_BLOCK_OWNER = 1,
  /** Parcel owner — owns a child inscription within a block */
  TIER_2_PARCEL_OWNER = 2,
  /** Delegated access — pays rental fee for access via Tier 3 verification */
  TIER_3_DELEGATED = 3,
}

export interface TierPermissions {
  /** Can view blocks and parcels in the Nexus */
  canView: boolean;
  /** Can chat in public block chat */
  canChat: boolean;
  /** Can build/customize on owned land */
  canBuild: boolean;
  /** Can post media (images, GIFs, video) */
  canPostMedia: boolean;
  /** Can send DMs to other users */
  canDM: boolean;
  /** Can livestream on owned land */
  canStream: boolean;
  /** Can link VPS/Server to land */
  canLinkVPS: boolean;
  /** Can link AI Agent to land */
  canLinkAgent: boolean;
  /** Can delegate access to others (create Tier 3) */
  canDelegate: boolean;
  /** Can create estates (merge parcels) */
  canCreateEstate: boolean;
  /** Can customize land (color, image, pattern) */
  canCustomize: boolean;
  /** Can shop/transact on published experiences */
  canCommerce: boolean;
  /** Can set display name + avatar */
  canSetProfile: boolean;
}

/** Permission matrix by tier */
export const TIER_PERMISSIONS: Record<VerificationTier, TierPermissions> = {
  [VerificationTier.TIER_1_BLOCK_OWNER]: {
    canView: true,
    canChat: true,
    canBuild: true,
    canPostMedia: true,
    canDM: true,
    canStream: true,
    canLinkVPS: true,
    canLinkAgent: true,
    canDelegate: true,
    canCreateEstate: true,
    canCustomize: true,
    canCommerce: true,
    canSetProfile: true,
  },
  [VerificationTier.TIER_2_PARCEL_OWNER]: {
    canView: true,
    canChat: true,
    canBuild: true,
    canPostMedia: true,
    canDM: true,
    canStream: true,
    canLinkVPS: true,
    canLinkAgent: true,
    canDelegate: true,
    canCreateEstate: true,
    canCustomize: true,
    canCommerce: true,
    canSetProfile: true,
  },
  [VerificationTier.TIER_3_DELEGATED]: {
    canView: true,
    canChat: true,
    canBuild: false,
    canPostMedia: false,
    canDM: false,
    canStream: false,
    canLinkVPS: false,
    canLinkAgent: false,
    canDelegate: false,
    canCreateEstate: false,
    canCustomize: false,
    canCommerce: true,  // Can shop/transact on published experiences
    canSetProfile: true, // Display name + avatar only
  },
};

/* ═══════════════════════════════════════════
   DELEGATION FEE TRANSACTION
   ═══════════════════════════════════════════ */

export interface DelegationFee {
  /** Total fee in satoshis paid by the Tier 3 applicant */
  totalSats: number;
  /** Owner's share (97%) in satoshis */
  ownerShareSats: number;
  /** Protocol fee (3%) in satoshis */
  protocolFeeSats: number;
  /** Owner's Bitcoin address (block or parcel owner) */
  ownerAddress: string;
  /** Protocol fee address */
  protocolAddress: string;
}

/**
 * Calculate the fee split for a Tier 3 delegation.
 * Generates the exact satoshi amounts for both outputs.
 * 
 * @param totalSats - Total delegation rental fee in satoshis
 * @param ownerAddress - Bitcoin address of the block/parcel owner
 * @returns DelegationFee with exact split amounts
 */
export function calculateDelegationFee(
  totalSats: number,
  ownerAddress: string,
): DelegationFee {
  // Protocol gets 3%, owner gets 97%
  const protocolFeeSats = Math.ceil(totalSats * PROTOCOL_FEE_PERCENT / 100);
  const ownerShareSats = totalSats - protocolFeeSats; // Remainder to owner (avoids rounding loss)

  return {
    totalSats,
    ownerShareSats,
    protocolFeeSats,
    ownerAddress,
    protocolAddress: PROTOCOL_FEE_ADDRESS,
  };
}

/**
 * Generate an unsigned PSBT-compatible transaction skeleton for Tier 3 delegation.
 * The user signs this with their wallet to complete the delegation payment.
 * 
 * Outputs:
 *   1. ownerShareSats → ownerAddress (97%)
 *   2. protocolFeeSats → PROTOCOL_FEE_ADDRESS (3%)
 *   3. OP_RETURN with delegation metadata (block height, txIndex, duration)
 * 
 * @param fee - Calculated delegation fee
 * @param blockHeight - Block being delegated on
 * @param txIndex - Parcel index (-1 for block-level delegation)
 * @param durationDays - Delegation duration in days
 * @returns Transaction skeleton for wallet signing
 */
export function buildDelegationTx(
  fee: DelegationFee,
  blockHeight: number,
  txIndex: number,
  durationDays: number,
): DelegationTxSkeleton {
  // OP_RETURN metadata: "BG_DELEGATE|blockHeight|txIndex|durationDays"
  const opReturnData = `BG_DELEGATE|${blockHeight}|${txIndex}|${durationDays}`;

  return {
    outputs: [
      { address: fee.ownerAddress, value: fee.ownerShareSats },
      { address: fee.protocolAddress, value: fee.protocolFeeSats },
      { type: 'OP_RETURN', data: opReturnData },
    ],
    metadata: {
      type: 'tier3_delegation',
      blockHeight,
      txIndex,
      durationDays,
      totalSats: fee.totalSats,
      ownerShareSats: fee.ownerShareSats,
      protocolFeeSats: fee.protocolFeeSats,
    },
  };
}

export interface DelegationTxOutput {
  address?: string;
  value?: number;
  type?: 'OP_RETURN';
  data?: string;
}

export interface DelegationTxSkeleton {
  outputs: DelegationTxOutput[];
  metadata: {
    type: 'tier3_delegation';
    blockHeight: number;
    txIndex: number;
    durationDays: number;
    totalSats: number;
    ownerShareSats: number;
    protocolFeeSats: number;
  };
}

/* ═══════════════════════════════════════════
   DELEGATION DURATION OPTIONS
   ═══════════════════════════════════════════ */

export const DELEGATION_DURATIONS = [
  { days: 30, label: '1 Month', description: 'Monthly access' },
  { days: 365, label: '1 Year', description: 'Annual access' },
] as const;

/* ═══════════════════════════════════════════
   BADGE TIERS
   ═══════════════════════════════════════════ */

export const TIER_BADGE_COLORS = {
  [VerificationTier.TIER_1_BLOCK_OWNER]: { primary: '#FFD700', label: 'Gold', glow: '#FFD70066' },
  [VerificationTier.TIER_2_PARCEL_OWNER]: { primary: '#00CCFF', label: 'Cyan', glow: '#00CCFF66' },
  [VerificationTier.TIER_3_DELEGATED]: { primary: '#AA44FF', label: 'Purple', glow: '#AA44FF66' },
} as const;

/* ═══════════════════════════════════════════
   DELEGATION LISTING (Owner-set pricing)
   ═══════════════════════════════════════════ */

export interface DelegationListing {
  /** Block height this listing is for */
  blockHeight: number;
  /** Parcel txIndex (-1 = block-level access) */
  txIndex: number;
  /** Owner's Bitcoin address */
  ownerAddress: string;
  /** Owner's handle */
  ownerHandle: string;
  /** Owner tier (1 or 2) */
  ownerTier: 1 | 2;
  /** Price for 1 month in sats (set by owner) */
  monthlyPriceSats: number;
  /** Price for 1 year in sats (set by owner) */
  yearlyPriceSats: number;
  /** Max number of Tier 3 delegates allowed (-1 = unlimited) */
  maxSpots: number;
  /** Current active delegates */
  activeSpots: number;
  /** Whether listing is active */
  active: boolean;
  /** Optional welcome message */
  welcomeMessage?: string;
  /** Created timestamp */
  createdAt: number;
}

/** Calculate spots remaining */
export function spotsRemaining(listing: DelegationListing): number | 'unlimited' {
  if (listing.maxSpots === -1) return 'unlimited';
  return Math.max(0, listing.maxSpots - listing.activeSpots);
}

/** Check if listing has spots available */
export function hasAvailableSpots(listing: DelegationListing): boolean {
  if (listing.maxSpots === -1) return true;
  return listing.activeSpots < listing.maxSpots;
}

export const TIER_LABELS = {
  [VerificationTier.TIER_1_BLOCK_OWNER]: 'Block Owner (Tier 1)',
  [VerificationTier.TIER_2_PARCEL_OWNER]: 'Parcel Owner (Tier 2)',
  [VerificationTier.TIER_3_DELEGATED]: 'Delegated Access (Tier 3)',
} as const;
