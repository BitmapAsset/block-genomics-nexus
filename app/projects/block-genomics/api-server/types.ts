// ============================================================================
// Block Genomics — Verification API Type Definitions
// ============================================================================

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

export interface ChallengeRequest {
  blockHeight: number;
  agentName: string;
  walletAddress: string;
}

export interface ChallengeRecord {
  id: string;
  nonce: string;
  message: string;
  blockHeight: number;
  agentName: string;
  walletAddress: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  ip: string;
}

export interface ChallengeResponse {
  challengeId: string;
  challengeMessage: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifyRequest {
  challengeId: string;
  signature: string;
  address: string;
  blockHeight: number;
}

export interface VerifyResponse {
  verified: boolean;
  agent?: AgentPublic;
  error?: string;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface AgentRecord {
  id: string;
  name: string;
  walletAddress: string;
  blockHeight: number;
  genome: string;
  genomeVersion: number;
  trustScore: number;
  trustFactors: TrustFactors;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
  signatureType: 'legacy' | 'segwit' | 'taproot-pending';
  bitmapInscriptionId: string | null;
}

/** Public-safe subset — never leak wallet internals */
export interface AgentPublic {
  id: string;
  name: string;
  blockHeight: number;
  genome: string;
  genomeVersion: number;
  trustScore: number;
  trustFactors: TrustFactors;
  verifiedAt: string;
  createdAt: string;
  signatureType: 'legacy' | 'segwit' | 'taproot-pending';
}

// ---------------------------------------------------------------------------
// Trust Score
// ---------------------------------------------------------------------------

export interface TrustFactors {
  signatureValid: boolean;
  bitmapOwnership: boolean;
  blockExists: boolean;
  addressFormat: 'legacy' | 'segwit-native' | 'segwit-compat' | 'taproot' | 'unknown';
  inscriptionAge: number | null;   // days since inscription, null if unknown
  blockAge: number | null;         // days since block was mined
}

// ---------------------------------------------------------------------------
// Block / Genome
// ---------------------------------------------------------------------------

export interface BlockData {
  height: number;
  hash: string;
  merkleRoot: string;
  timestamp: number;
  nonce: number;
  bits: string;
  difficulty: number;
  txCount: number;
  size: number;
  weight: number;
  previousBlockHash: string;
}

export interface GenomeInputs {
  version: number;
  blockHash: string;
  merkleRoot: string;
  timestamp: number;
  nonce: number;
  bits: string;
  difficulty: number;
  txCount: number;
  size: number;
  weight: number;
}

export interface BlockResponse {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  weight: number;
  genome: string | null;
  genomeVersion: number;
  verified: boolean;
  agent: AgentPublic | null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: 'agent' | 'block';
  id: string;
  name: string;
  blockHeight: number;
  genome: string | null;
  trustScore: number | null;
  matchField: string;
}

// ---------------------------------------------------------------------------
// Bitmap / Ordinals
// ---------------------------------------------------------------------------

export interface OrdinalInscription {
  id: string;
  number: number;
  address: string;
  content_type: string;
  content_length: number;
  genesis_timestamp: number;
  genesis_block_height: number;
}

export interface BitmapCheckResult {
  owns: boolean;
  inscriptionId: string | null;
  inscriptionAge: number | null;  // days
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ---------------------------------------------------------------------------
// API Error
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  code: string;
  status: number;
}
