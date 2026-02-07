/**
 * Block Genomics — Verified Claims System
 * TypeScript Type Definitions
 *
 * These types define the full interface for the claims system.
 * They mirror the Prisma schema but add runtime validation,
 * API request/response shapes, and verifier interfaces.
 */

// =============================================================================
// CORE ENUMS
// =============================================================================

/** Types of real-world anchors that can be claimed */
export enum ClaimType {
  EMAIL = 'EMAIL',
  TWITTER = 'TWITTER',
  DOMAIN = 'DOMAIN',
  NOSTR = 'NOSTR',
  API_ENDPOINT = 'API_ENDPOINT',
  SIGNING_KEY = 'SIGNING_KEY',
}

/** Lifecycle status of a verified claim */
export enum ClaimStatus {
  /** Challenge issued, awaiting proof */
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  /** Proof submitted, async validation in progress */
  PROCESSING = 'PROCESSING',
  /** Claim verified and active */
  ACTIVE = 'ACTIVE',
  /** Verification failed */
  FAILED = 'FAILED',
  /** Claim expired, needs re-verification */
  EXPIRED = 'EXPIRED',
  /** Revoked by claim owner */
  REVOKED = 'REVOKED',
  /** Suspended by admin */
  SUSPENDED = 'SUSPENDED',
}

/** What triggered a verification attempt */
export enum VerificationTrigger {
  INITIAL = 'initial',
  RE_VERIFICATION = 're_verification',
  MANUAL = 'manual',
  REFRESH = 'refresh',
}

// =============================================================================
// CLAIM CONFIGURATION
// =============================================================================

/** TTL and re-verification configuration per claim type */
export interface ClaimTypeConfig {
  /** Claim type */
  type: ClaimType;
  /** Human-readable label */
  label: string;
  /** How long a verified claim remains active (milliseconds) */
  ttlMs: number;
  /** How long a challenge remains valid (milliseconds) */
  challengeTtlMs: number;
  /** Max verification attempts per hour */
  maxAttemptsPerHour: number;
  /** Max claims of this type per agent */
  maxPerAgent: number;
  /** Whether this claim type supports re-verification */
  supportsRefresh: boolean;
  /** Icon for UI display */
  icon: string;
  /** Description of what this claim proves */
  description: string;
}

/** Default configuration for each claim type */
export const CLAIM_TYPE_CONFIGS: Record<ClaimType, ClaimTypeConfig> = {
  [ClaimType.EMAIL]: {
    type: ClaimType.EMAIL,
    label: 'Email',
    ttlMs: 90 * 24 * 60 * 60 * 1000,       // 90 days
    challengeTtlMs: 10 * 60 * 1000,          // 10 minutes
    maxAttemptsPerHour: 5,
    maxPerAgent: 5,
    supportsRefresh: true,
    icon: '📧',
    description: 'Proves control of an email address',
  },
  [ClaimType.TWITTER]: {
    type: ClaimType.TWITTER,
    label: 'X / Twitter',
    ttlMs: 30 * 24 * 60 * 60 * 1000,       // 30 days
    challengeTtlMs: 30 * 60 * 1000,          // 30 minutes
    maxAttemptsPerHour: 3,
    maxPerAgent: 3,
    supportsRefresh: true,
    icon: '🔗',
    description: 'Proves ownership of an X/Twitter account',
  },
  [ClaimType.DOMAIN]: {
    type: ClaimType.DOMAIN,
    label: 'Domain',
    ttlMs: 30 * 24 * 60 * 60 * 1000,       // 30 days
    challengeTtlMs: 24 * 60 * 60 * 1000,    // 24 hours (DNS propagation)
    maxAttemptsPerHour: 5,
    maxPerAgent: 20,
    supportsRefresh: true,
    icon: '🌐',
    description: 'Proves control of a domain via DNS TXT record',
  },
  [ClaimType.NOSTR]: {
    type: ClaimType.NOSTR,
    label: 'Nostr',
    ttlMs: 90 * 24 * 60 * 60 * 1000,       // 90 days
    challengeTtlMs: 30 * 60 * 1000,          // 30 minutes
    maxAttemptsPerHour: 5,
    maxPerAgent: 3,
    supportsRefresh: true,
    icon: '🆔',
    description: 'Proves ownership of a Nostr identity (npub)',
  },
  [ClaimType.API_ENDPOINT]: {
    type: ClaimType.API_ENDPOINT,
    label: 'API Endpoint',
    ttlMs: 7 * 24 * 60 * 60 * 1000,        // 7 days
    challengeTtlMs: 5 * 60 * 1000,           // 5 minutes
    maxAttemptsPerHour: 10,
    maxPerAgent: 10,
    supportsRefresh: true,
    icon: '🤖',
    description: 'Proves control of an API endpoint (for AI agents)',
  },
  [ClaimType.SIGNING_KEY]: {
    type: ClaimType.SIGNING_KEY,
    label: 'Signing Key',
    ttlMs: 365 * 24 * 60 * 60 * 1000,      // 365 days
    challengeTtlMs: 60 * 60 * 1000,          // 1 hour
    maxAttemptsPerHour: 5,
    maxPerAgent: 5,
    supportsRefresh: true,
    icon: '🔑',
    description: 'Proves possession of a cryptographic signing key',
  },
};

// =============================================================================
// CHALLENGE & PROOF TYPES
// =============================================================================

/** Base challenge issued by the system */
export interface ClaimChallenge {
  /** Unique claim ID */
  claimId: string;
  /** Claim type */
  claimType: ClaimType;
  /** What's being claimed */
  claimValue: string;
  /** Agent ID making the claim */
  agentId: string;
  /** Agent's genome hash (binds challenge to identity) */
  genome: string;
  /** Cryptographically random nonce (32 hex chars) */
  nonce: string;
  /** When this challenge was issued */
  issuedAt: Date;
  /** When this challenge expires */
  expiresAt: Date;
  /** Human-readable instructions for completing verification */
  instructions: string;
}

/** Email-specific challenge data */
export interface EmailChallenge extends ClaimChallenge {
  claimType: ClaimType.EMAIL;
  /** 6-digit verification code sent to the email */
  code: string;
  /** SHA-256 hash of the code (stored server-side, code itself is emailed) */
  codeHash: string;
}

/** Twitter/X-specific challenge data */
export interface TwitterChallenge extends ClaimChallenge {
  claimType: ClaimType.TWITTER;
  /** OAuth state parameter */
  oauthState: string;
  /** PKCE code verifier (stored server-side) */
  codeVerifier: string;
  /** OAuth authorization URL to redirect user to */
  authorizationUrl: string;
}

/** Domain-specific challenge data */
export interface DomainChallenge extends ClaimChallenge {
  claimType: ClaimType.DOMAIN;
  /** The full TXT record name: _blockgenomics.example.com */
  txtRecordName: string;
  /** The TXT record value to set */
  txtRecordValue: string;
}

/** Nostr-specific challenge data */
export interface NostrChallenge extends ClaimChallenge {
  claimType: ClaimType.NOSTR;
  /** The npub being claimed */
  npub: string;
  /** Expected kind:30078 event content */
  expectedEventContent: string;
}

/** API endpoint-specific challenge data */
export interface ApiEndpointChallenge extends ClaimChallenge {
  claimType: ClaimType.API_ENDPOINT;
  /** The URL that will receive the challenge */
  endpointUrl: string;
  /** HMAC key for signing the challenge payload */
  hmacKey: string;
  /** The challenge token the endpoint must return */
  challengeToken: string;
}

/** Union of all challenge types */
export type SpecificChallenge =
  | EmailChallenge
  | TwitterChallenge
  | DomainChallenge
  | NostrChallenge
  | ApiEndpointChallenge;

// =============================================================================
// PROOF TYPES (submitted by the claimant)
// =============================================================================

/** Base proof structure */
export interface ClaimProofBase {
  /** The claim ID this proof is for */
  claimId: string;
  /** The challenge nonce this proof responds to */
  nonce: string;
  /** Proof type identifier */
  proofType: string;
}

/** Email proof: user submits the code they received */
export interface EmailProof extends ClaimProofBase {
  proofType: 'email_code';
  /** The 6-digit code received via email */
  code: string;
}

/** Twitter proof: OAuth callback data */
export interface TwitterProof extends ClaimProofBase {
  proofType: 'oauth_token';
  /** OAuth authorization code from callback */
  authorizationCode: string;
  /** OAuth state parameter (must match challenge) */
  state: string;
  /** PKCE code verifier */
  codeVerifier: string;
}

/** Domain proof: confirmation that DNS record was set */
export interface DomainProof extends ClaimProofBase {
  proofType: 'dns_txt_record';
  /** The domain being verified (system will check DNS) */
  domain: string;
}

/** Nostr proof: signed event from the claimed npub */
export interface NostrProof extends ClaimProofBase {
  proofType: 'nostr_event';
  /** The signed Nostr event (JSON) */
  signedEvent: NostrEvent;
}

/** API endpoint proof: the endpoint's response to our challenge */
export interface ApiEndpointProof extends ClaimProofBase {
  proofType: 'http_challenge';
  /** Response body from the endpoint (system verifies by calling the endpoint) */
  // Note: system calls the endpoint directly; this is just a trigger
}

/** Signing key proof: signature over the challenge */
export interface SigningKeyProof extends ClaimProofBase {
  proofType: 'signature';
  /** The signature over the challenge message */
  signature: string;
  /** The public key (hex or DID format) */
  publicKey: string;
  /** Signature algorithm used */
  algorithm: 'ed25519' | 'secp256k1' | 'ecdsa-p256';
}

/** Union of all proof types */
export type ClaimProof =
  | EmailProof
  | TwitterProof
  | DomainProof
  | NostrProof
  | ApiEndpointProof
  | SigningKeyProof;

// =============================================================================
// NOSTR TYPES
// =============================================================================

/** Nostr event structure (NIP-01) */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** NIP-05 verification response */
export interface Nip05Response {
  names: Record<string, string>;
  relays?: Record<string, string[]>;
}

// =============================================================================
// VERIFIED CLAIM (full record)
// =============================================================================

/** A verified claim as stored in the database and returned by the API */
export interface VerifiedClaim {
  id: string;
  agentId: string;
  claimType: ClaimType;
  claimValue: string;
  displayValue: string;
  status: ClaimStatus;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  statusReason: string | null;
  verificationCount: number;
  failureStreak: number;
  isPublic: boolean;
  isPrimary: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Claim with its proofs included */
export interface VerifiedClaimWithProofs extends VerifiedClaim {
  proofs: StoredClaimProof[];
}

/** A stored proof record */
export interface StoredClaimProof {
  id: string;
  claimId: string;
  proofType: string;
  proofData: Record<string, unknown>;
  proofHash: string;
  challengeNonce: string;
  isValid: boolean;
  genomeAtProof: string;
  blockHeightAtProof: number | null;
  onChainTxId: string | null;
  createdAt: Date;
}

// =============================================================================
// API REQUEST / RESPONSE TYPES
// =============================================================================

/** Request to initiate a new claim */
export interface InitiateClaimRequest {
  /** Agent ID making the claim */
  agentId: string;
  /** Type of claim */
  claimType: ClaimType;
  /** Value being claimed (email, handle, domain, npub, URL) */
  claimValue: string;
  /** Whether this claim should be publicly visible */
  isPublic?: boolean;
}

/** Response from initiating a claim */
export interface InitiateClaimResponse {
  /** The created/updated claim record */
  claim: VerifiedClaim;
  /** The challenge to complete */
  challenge: ClaimChallenge;
  /** Human-readable instructions */
  instructions: string;
}

/** Request to submit proof for a pending claim */
export interface SubmitProofRequest {
  /** Claim ID */
  claimId: string;
  /** The proof data */
  proof: ClaimProof;
}

/** Response from submitting proof */
export interface SubmitProofResponse {
  /** Updated claim record */
  claim: VerifiedClaim;
  /** Whether verification succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
}

/** Query parameters for listing claims */
export interface ListClaimsQuery {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by claim type */
  claimType?: ClaimType;
  /** Filter by status */
  status?: ClaimStatus;
  /** Filter by claim value (exact match) */
  claimValue?: string;
  /** Only public claims */
  publicOnly?: boolean;
  /** Include proofs in response */
  includeProofs?: boolean;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit (max 100) */
  limit?: number;
}

/** Response from listing claims */
export interface ListClaimsResponse {
  claims: VerifiedClaim[] | VerifiedClaimWithProofs[];
  total: number;
  offset: number;
  limit: number;
}

/** Reverse lookup: find agents by a claim value */
export interface ReverseLookupQuery {
  claimType: ClaimType;
  claimValue: string;
}

export interface ReverseLookupResponse {
  claims: Array<{
    claim: VerifiedClaim;
    agent: {
      id: string;
      name: string;
      genome: string;
      tier: number;
      trustScore: number;
    };
  }>;
}

// =============================================================================
// VERIFIER INTERFACE
// =============================================================================

/**
 * Interface that all claim verifiers must implement.
 * Each claim type (email, twitter, domain, etc.) has its own verifier
 * that handles challenge generation and proof validation.
 */
export interface ClaimVerifier<
  TChallenge extends ClaimChallenge = ClaimChallenge,
  TProof extends ClaimProofBase = ClaimProofBase,
> {
  /** The claim type this verifier handles */
  readonly claimType: ClaimType;

  /**
   * Validate that the claim value is well-formed.
   * e.g., valid email format, valid domain, valid npub
   * @returns null if valid, error message if invalid
   */
  validateClaimValue(value: string): string | null;

  /**
   * Normalize the claim value for storage.
   * e.g., lowercase email, strip @ from twitter handle
   */
  normalizeClaimValue(value: string): string;

  /**
   * Generate a challenge for the claimant to prove ownership.
   * Side effects: may send an email, set up OAuth, etc.
   */
  generateChallenge(params: {
    claimId: string;
    agentId: string;
    genome: string;
    claimValue: string;
    nonce: string;
  }): Promise<TChallenge>;

  /**
   * Verify the proof submitted by the claimant.
   * @returns Object with success flag and optional error/metadata
   */
  verifyProof(
    challenge: TChallenge,
    proof: TProof,
  ): Promise<VerificationResult>;

  /**
   * Check if an active claim is still valid (for re-verification).
   * Called periodically for claims nearing expiration.
   * @returns true if claim is still valid, false if it should be expired
   */
  recheckClaim?(claim: VerifiedClaim): Promise<RecheckResult>;
}

/** Result of a verification attempt */
export interface VerificationResult {
  /** Whether verification succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: VerificationErrorCode;
  /** Additional metadata to store with the claim */
  metadata?: Record<string, unknown>;
  /** Proof data to store */
  proofData?: Record<string, unknown>;
}

/** Result of a re-check (periodic re-verification) */
export interface RecheckResult {
  /** Whether the claim is still valid */
  valid: boolean;
  /** Reason if invalid */
  reason?: string;
  /** Updated metadata (e.g., new follower count for Twitter) */
  updatedMetadata?: Record<string, unknown>;
}

/** Standardized error codes */
export enum VerificationErrorCode {
  /** Claim value is invalid format */
  INVALID_CLAIM_VALUE = 'INVALID_CLAIM_VALUE',
  /** Challenge has expired */
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  /** Proof doesn't match challenge */
  PROOF_MISMATCH = 'PROOF_MISMATCH',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Max claims of this type reached */
  MAX_CLAIMS_REACHED = 'MAX_CLAIMS_REACHED',
  /** External service error (email, OAuth, DNS) */
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  /** Claim value already claimed by another agent */
  ALREADY_CLAIMED = 'ALREADY_CLAIMED',
  /** Agent not found */
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  /** Claim not found */
  CLAIM_NOT_FOUND = 'CLAIM_NOT_FOUND',
  /** Invalid proof type for this claim */
  INVALID_PROOF_TYPE = 'INVALID_PROOF_TYPE',
  /** Nonce mismatch (replay attack) */
  NONCE_MISMATCH = 'NONCE_MISMATCH',
  /** DNS record not found */
  DNS_NOT_FOUND = 'DNS_NOT_FOUND',
  /** OAuth flow error */
  OAUTH_ERROR = 'OAUTH_ERROR',
  /** Nostr event signature invalid */
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  /** API endpoint unreachable */
  ENDPOINT_UNREACHABLE = 'ENDPOINT_UNREACHABLE',
  /** Internal server error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// =============================================================================
// TRUST SCORE IMPACT
// =============================================================================

/** How verified claims affect trust score calculation */
export interface ClaimTrustImpact {
  /** Claim type */
  claimType: ClaimType;
  /** Base trust points added when claim is active */
  basePoints: number;
  /** Maximum points from claims of this type (caps multiple claims) */
  maxPoints: number;
  /** Multiplier for trust score (1.0 = no change) */
  multiplier: number;
}

/** Default trust impacts per claim type */
export const CLAIM_TRUST_IMPACTS: Record<ClaimType, ClaimTrustImpact> = {
  [ClaimType.EMAIL]: {
    claimType: ClaimType.EMAIL,
    basePoints: 2,
    maxPoints: 4,
    multiplier: 1.0,
  },
  [ClaimType.TWITTER]: {
    claimType: ClaimType.TWITTER,
    basePoints: 3,
    maxPoints: 5,
    multiplier: 1.05,
  },
  [ClaimType.DOMAIN]: {
    claimType: ClaimType.DOMAIN,
    basePoints: 5,
    maxPoints: 15,
    multiplier: 1.1,
  },
  [ClaimType.NOSTR]: {
    claimType: ClaimType.NOSTR,
    basePoints: 3,
    maxPoints: 5,
    multiplier: 1.05,
  },
  [ClaimType.API_ENDPOINT]: {
    claimType: ClaimType.API_ENDPOINT,
    basePoints: 4,
    maxPoints: 10,
    multiplier: 1.08,
  },
  [ClaimType.SIGNING_KEY]: {
    claimType: ClaimType.SIGNING_KEY,
    basePoints: 5,
    maxPoints: 10,
    multiplier: 1.1,
  },
};

// =============================================================================
// EVENT TYPES (for webhooks / event system)
// =============================================================================

/** Events emitted by the claims system */
export type ClaimEvent =
  | { type: 'claim.initiated'; claimId: string; agentId: string; claimType: ClaimType; claimValue: string }
  | { type: 'claim.verified'; claimId: string; agentId: string; claimType: ClaimType; claimValue: string }
  | { type: 'claim.failed'; claimId: string; agentId: string; claimType: ClaimType; error: string }
  | { type: 'claim.expired'; claimId: string; agentId: string; claimType: ClaimType }
  | { type: 'claim.revoked'; claimId: string; agentId: string; claimType: ClaimType; reason?: string }
  | { type: 'claim.refreshed'; claimId: string; agentId: string; claimType: ClaimType };
