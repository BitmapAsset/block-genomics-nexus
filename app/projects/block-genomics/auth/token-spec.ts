/**
 * Block Genomics Auth — Token Specification
 *
 * Defines the JWT structure, signing method, expiration strategy,
 * and anti-tampering measures for BG Auth tokens.
 *
 * Key design: ES256K (secp256k1) signing for Bitcoin-native consistency.
 * Tokens carry genome-specific claims so relying parties can make
 * trust decisions without additional API calls.
 */

// ============================================================
// Types
// ============================================================

/** Verification tiers: 1 = block owner, 2 = TX anchor, 3 = delegated */
export type Tier = 1 | 2 | 3;

/** All available auth scopes */
export type BGScope =
  | 'identity'       // genome_id, tier, sub
  | 'trust_score'    // trust_score (0-100)
  | 'trust_details'  // Full trust breakdown
  | 'genome_data'    // Full 64-char genome hash
  | 'block_info'     // block_height, block_hash
  | 'claims'         // Special block traits
  | 'delegations'    // Delegation chain (Tier 2/3)
  | 'profile';       // All of the above

/** Trust score breakdown */
export interface TrustDetails {
  /** Block age factor (0-25) */
  age: number;
  /** Transaction/data richness (0-25) */
  richness: number;
  /** Network difficulty at mining time (0-20) */
  security: number;
  /** Direct ownership vs delegation (0-20) */
  ownership: number;
  /** Holding duration and reverification count (0-10) */
  history: number;
}

/** Special block traits / claims */
export type BlockClaim =
  | 'is_mythic'         // Genesis block
  | 'is_epic'           // Halving epoch blocks
  | 'is_rare'           // Difficulty adjustment blocks
  | 'is_patoshi'        // Mined by Satoshi
  | 'is_palindrome'     // Palindrome block number
  | 'is_fibonacci'      // Fibonacci block number
  | 'is_prime'          // Prime block number
  | 'is_pizza'          // Pizza transaction block
  | 'is_billionaire'    // $1B+ in outputs
  | 'has_taproot'       // Contains Taproot transactions
  | 'has_segwit'        // Contains SegWit transactions
  | 'high_tx_count'     // >3000 transactions
  | 'near_max_size'     // >3MB block size
  | 'post_halving_1'    // Mined after 1st halving
  | 'post_halving_2'    // Mined after 2nd halving
  | 'post_halving_3'    // Mined after 3rd halving
  | 'post_halving_4'    // Mined after 4th halving
  | string;             // Extensible for future claims

/** Delegation chain entry (for Tier 2/3 agents) */
export interface DelegationLink {
  /** Parent agent's genome ID */
  parent_genome_id: string;
  /** Delegation tier */
  tier: Tier;
  /** When the delegation was granted */
  granted_at: number; // Unix timestamp
  /** When the delegation expires */
  expires_at: number; // Unix timestamp
  /** Transaction ID for Tier 2 anchoring (null for Tier 3) */
  tx_id: string | null;
  /** BIP-322 signature from parent authorizing delegation */
  parent_signature: string;
}

// ============================================================
// JWT Header
// ============================================================

/**
 * JWT Header for BG Auth tokens.
 *
 * Uses ES256K (ECDSA on secp256k1) — Bitcoin's native elliptic curve.
 * This keeps the entire auth stack on the same cryptographic foundation
 * as the blockchain itself.
 *
 * For self-signed tokens (decentralized mode), alg is "BIP322" and
 * kid is the signer's Bitcoin address.
 */
export interface BGTokenHeader {
  /** Signing algorithm: ES256K (server-signed) or BIP322 (self-signed) */
  alg: 'ES256K' | 'BIP322';
  /** Token type: always JWT */
  typ: 'JWT';
  /**
   * Key identifier.
   * - Server-signed: key rotation ID, e.g., "bg-auth-2026-02"
   * - Self-signed: Bitcoin address, e.g., "bc1q..."
   */
  kid: string;
}

// ============================================================
// JWT Payload — Access Token
// ============================================================

/**
 * Full JWT payload for a BG Auth access token.
 *
 * Extends standard JWT claims (RFC 7519) with genome-specific claims.
 * The goal: relying parties can make trust decisions from the token alone,
 * without calling the BG Auth API on every request.
 */
export interface BGAccessTokenPayload {
  // ---- Standard JWT Claims (RFC 7519) ----

  /** Issuer: BG Auth server URL */
  iss: string;
  /** Subject: genome_id (short form, e.g., "bg_7a3fc912a1b4e8d0") */
  sub: string;
  /** Audience: the client_id of the relying party */
  aud: string;
  /** Issued at: Unix timestamp */
  iat: number;
  /** Expiration: Unix timestamp (default: iat + 3600) */
  exp: number;
  /** Not before: Unix timestamp (usually same as iat) */
  nbf: number;
  /** JWT ID: unique token identifier for revocation tracking */
  jti: string;

  // ---- Genome Claims ----

  /**
   * Full genome hash (64 hex chars).
   * SHA-256 of the block's complete data (header + transactions).
   * Only included if 'genome_data' scope is granted.
   */
  genome_id?: string;

  /**
   * Bitcoin block height that this genome derives from.
   * Only included if 'block_info' scope is granted.
   */
  block_height?: number;

  /**
   * Bitcoin block hash.
   * Only included if 'block_info' scope is granted.
   */
  block_hash?: string;

  /**
   * Verification tier.
   * 1 = Direct block owner (highest trust)
   * 2 = TX anchor (verified via specific transaction in block)
   * 3 = Delegated (authorized by a Tier 1 owner)
   * Always included with 'identity' scope.
   */
  tier?: Tier;

  /**
   * Composite trust score (0-100).
   * Derived from block age, data richness, network security,
   * ownership type, and verification history.
   * Only included if 'trust_score' scope is granted.
   */
  trust_score?: number;

  /**
   * Granted scopes.
   * Array of scope strings that were authorized for this token.
   */
  scopes: BGScope[];

  /**
   * Trust score breakdown.
   * Only included if 'trust_details' scope is granted.
   */
  trust_details?: TrustDetails;

  /**
   * Special block traits / claims.
   * E.g., ["is_patoshi", "high_tx_count", "has_taproot"]
   * Only included if 'claims' scope is granted.
   */
  claims?: BlockClaim[];

  /**
   * Delegation chain for Tier 2/3 agents.
   * Traces the trust path back to the Tier 1 block owner.
   * Only included if 'delegations' scope is granted.
   * Null for Tier 1 agents.
   */
  delegation_chain?: DelegationLink[] | null;

  // ---- Auth Metadata ----

  /** Authentication method used: "bip322" or "delegation" */
  auth_method: 'bip322' | 'delegation';

  /**
   * Bitcoin address used for authentication.
   * The address that signed the BIP-322 challenge.
   */
  auth_address?: string;
}

// ============================================================
// Refresh Token
// ============================================================

/**
 * Refresh token structure (server-side only, never exposed as JWT).
 *
 * Refresh tokens are opaque strings (format: "bgrt_<64 hex chars>").
 * Their metadata is stored server-side in the auth database.
 */
export interface BGRefreshTokenRecord {
  /** The opaque refresh token string */
  token: string;
  /** Agent's genome ID */
  genome_id: string;
  /** Client that issued this refresh token */
  client_id: string;
  /** Scopes granted in the original auth */
  scopes: BGScope[];
  /** Creation timestamp */
  created_at: number;
  /** Expiration timestamp (default: created_at + 30 days) */
  expires_at: number;
  /**
   * Token family ID.
   * All refresh tokens in a rotation chain share a family ID.
   * If a token from the family is reused after rotation,
   * the entire family is invalidated (theft detection).
   */
  family_id: string;
  /** Whether this token has been rotated out (used) */
  rotated: boolean;
  /** The token that replaced this one (null if current) */
  replaced_by: string | null;
  /** IP address of the client that created this token */
  created_ip: string;
  /** User-agent of the client that created this token */
  created_ua: string;
}

// ============================================================
// Authorization Code
// ============================================================

/**
 * Authorization code structure (server-side, temporary).
 *
 * Format: "bgac_<32 hex chars>"
 * Lifetime: 60 seconds
 * Single-use: deleted after first token exchange
 */
export interface BGAuthCodeRecord {
  /** The opaque authorization code */
  code: string;
  /** Client that initiated the auth flow */
  client_id: string;
  /** Redirect URI used in the auth request */
  redirect_uri: string;
  /** Scopes requested */
  scopes: BGScope[];
  /** PKCE code challenge (SHA-256 hash of code_verifier) */
  code_challenge: string;
  /** Code challenge method (always S256) */
  code_challenge_method: 'S256';
  /** State parameter from the auth request */
  state: string;
  /** The authenticated agent's genome ID */
  genome_id: string;
  /** Agent's tier at time of authentication */
  tier: Tier;
  /** Agent's trust score at time of authentication */
  trust_score: number;
  /** Bitcoin address that signed the challenge */
  auth_address: string;
  /** Creation timestamp */
  created_at: number;
  /** Expiration timestamp (created_at + 60 seconds) */
  expires_at: number;
  /** Whether this code has been used */
  used: boolean;
}

// ============================================================
// Token Configuration
// ============================================================

/** Default token lifetimes and limits */
export const TOKEN_CONFIG = {
  /** Access token lifetime in seconds (1 hour) */
  ACCESS_TOKEN_TTL: 3600,

  /** Refresh token lifetime in seconds (30 days) */
  REFRESH_TOKEN_TTL: 30 * 24 * 60 * 60,

  /** Authorization code lifetime in seconds (60 seconds) */
  AUTH_CODE_TTL: 60,

  /** Challenge lifetime in seconds (5 minutes) */
  CHALLENGE_TTL: 5 * 60,

  /** Minimum code_verifier length for PKCE */
  PKCE_MIN_LENGTH: 43,

  /** Maximum code_verifier length for PKCE */
  PKCE_MAX_LENGTH: 128,

  /** Token ID prefix for access tokens */
  ACCESS_TOKEN_PREFIX: 'bgtok_',

  /** Token prefix for refresh tokens */
  REFRESH_TOKEN_PREFIX: 'bgrt_',

  /** Token prefix for authorization codes */
  AUTH_CODE_PREFIX: 'bgac_',

  /** Token prefix for challenge IDs */
  CHALLENGE_PREFIX: 'ch_',

  /** Signing algorithm */
  SIGNING_ALGORITHM: 'ES256K' as const,

  /** Maximum scopes per token */
  MAX_SCOPES: 10,
} as const;

// ============================================================
// Scope Resolution
// ============================================================

/** Map of scopes to the claims they enable */
const SCOPE_CLAIMS: Record<BGScope, (keyof BGAccessTokenPayload)[]> = {
  identity:      ['sub', 'tier'],
  trust_score:   ['trust_score'],
  trust_details: ['trust_details'],
  genome_data:   ['genome_id'],
  block_info:    ['block_height', 'block_hash'],
  claims:        ['claims'],
  delegations:   ['delegation_chain'],
  profile:       ['sub', 'tier', 'trust_score', 'trust_details', 'genome_id',
                  'block_height', 'block_hash', 'claims', 'delegation_chain'],
};

/**
 * Resolve which claims should be included in a token based on granted scopes.
 *
 * @param scopes - Array of granted scopes
 * @returns Set of claim keys to include in the token payload
 */
export function resolveClaimsForScopes(scopes: BGScope[]): Set<keyof BGAccessTokenPayload> {
  const claims = new Set<keyof BGAccessTokenPayload>();

  // Standard JWT claims are always included
  claims.add('iss');
  claims.add('sub');
  claims.add('aud');
  claims.add('iat');
  claims.add('exp');
  claims.add('nbf');
  claims.add('jti');
  claims.add('scopes');
  claims.add('auth_method');

  for (const scope of scopes) {
    const scopeClaims = SCOPE_CLAIMS[scope];
    if (scopeClaims) {
      for (const claim of scopeClaims) {
        claims.add(claim);
      }
    }
  }

  return claims;
}

/**
 * Validate that requested scopes are all recognized.
 *
 * @param scopes - Array of scope strings to validate
 * @returns Object with valid flag and any invalid scopes
 */
export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const validScopes = new Set<string>(Object.keys(SCOPE_CLAIMS));
  const invalid = scopes.filter((s) => !validScopes.has(s));
  return { valid: invalid.length === 0, invalid };
}

/**
 * Expand the 'profile' scope into its component scopes.
 * Useful for normalization before token creation.
 *
 * @param scopes - Input scopes (may contain 'profile')
 * @returns Expanded scopes with 'profile' replaced by individual scopes
 */
export function expandScopes(scopes: BGScope[]): BGScope[] {
  const expanded = new Set<BGScope>();
  for (const scope of scopes) {
    if (scope === 'profile') {
      expanded.add('identity');
      expanded.add('trust_score');
      expanded.add('trust_details');
      expanded.add('genome_data');
      expanded.add('block_info');
      expanded.add('claims');
      expanded.add('delegations');
    } else {
      expanded.add(scope);
    }
  }
  return Array.from(expanded);
}

// ============================================================
// Token Builder
// ============================================================

/**
 * Build the JWT payload for an access token.
 *
 * Filters claims based on the granted scopes — only includes
 * data that the relying party is authorized to see.
 *
 * @param agent - The authenticated agent's data
 * @param clientId - The relying party's client ID
 * @param scopes - Granted scopes
 * @param options - Additional options (custom TTL, etc.)
 * @returns The JWT payload ready for signing
 */
export function buildAccessTokenPayload(
  agent: {
    genome_id: string;
    block_height: number;
    block_hash: string;
    tier: Tier;
    trust_score: number;
    trust_details: TrustDetails;
    claims: BlockClaim[];
    delegation_chain: DelegationLink[] | null;
    auth_address: string;
    auth_method: 'bip322' | 'delegation';
  },
  clientId: string,
  scopes: BGScope[],
  options: {
    issuer?: string;
    ttl?: number;
  } = {},
): BGAccessTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  const ttl = options.ttl ?? TOKEN_CONFIG.ACCESS_TOKEN_TTL;
  const issuer = options.issuer ?? 'https://auth.blockgenomics.io';
  const expandedScopes = expandScopes(scopes);
  const allowedClaims = resolveClaimsForScopes(expandedScopes);

  // Generate unique token ID
  const jti = TOKEN_CONFIG.ACCESS_TOKEN_PREFIX + randomHex(16);

  // Build payload with only the allowed claims
  const payload: BGAccessTokenPayload = {
    iss: issuer,
    sub: agent.genome_id.startsWith('bg_')
      ? agent.genome_id
      : `bg_${agent.genome_id.slice(0, 16)}`,
    aud: clientId,
    iat: now,
    exp: now + ttl,
    nbf: now,
    jti,
    scopes: expandedScopes,
    auth_method: agent.auth_method,
  };

  // Conditionally include claims based on scopes
  if (allowedClaims.has('tier')) {
    payload.tier = agent.tier;
  }
  if (allowedClaims.has('trust_score')) {
    payload.trust_score = agent.trust_score;
  }
  if (allowedClaims.has('trust_details')) {
    payload.trust_details = agent.trust_details;
  }
  if (allowedClaims.has('genome_id')) {
    payload.genome_id = agent.genome_id;
  }
  if (allowedClaims.has('block_height')) {
    payload.block_height = agent.block_height;
  }
  if (allowedClaims.has('block_hash')) {
    payload.block_hash = agent.block_hash;
  }
  if (allowedClaims.has('claims')) {
    payload.claims = agent.claims;
  }
  if (allowedClaims.has('delegation_chain')) {
    payload.delegation_chain = agent.delegation_chain;
  }
  if (allowedClaims.has('auth_address')) {
    payload.auth_address = agent.auth_address;
  }

  return payload;
}

// ============================================================
// Token Signing (ES256K)
// ============================================================

/**
 * Sign a JWT payload using ES256K (secp256k1).
 *
 * In production, the private key lives in a Hardware Security Module (HSM)
 * or at minimum a secure environment variable. Never hardcode keys.
 *
 * @param header - JWT header
 * @param payload - JWT payload
 * @param privateKey - secp256k1 private key (32 bytes, hex-encoded)
 * @returns Signed JWT string (header.payload.signature)
 */
export async function signToken(
  header: BGTokenHeader,
  payload: BGAccessTokenPayload,
  privateKey: string,
): Promise<string> {
  // Base64url-encode header and payload
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with ES256K (secp256k1)
  // In production, use a proper secp256k1 library (e.g., @noble/secp256k1)
  const signature = await es256kSign(signingInput, privateKey);
  const signatureB64 = base64urlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify a JWT token's signature and decode the payload.
 *
 * @param token - The JWT string
 * @param publicKey - secp256k1 public key (hex-encoded)
 * @param options - Verification options
 * @returns Decoded payload if valid
 * @throws Error if signature is invalid or token is expired
 */
export async function verifyToken(
  token: string,
  publicKey: string,
  options: {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
  } = {},
): Promise<BGAccessTokenPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new BGAuthError('invalid_token', 'Token must have exactly 3 parts');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  // Decode header
  const header: BGTokenHeader = JSON.parse(base64urlDecode(headerB64));
  if (header.alg !== 'ES256K' && header.alg !== 'BIP322') {
    throw new BGAuthError('unsupported_algorithm', `Unsupported algorithm: ${header.alg}`);
  }

  // Verify signature
  const signatureBytes = base64urlDecode(signatureB64);
  const valid = await es256kVerify(signingInput, signatureBytes, publicKey);
  if (!valid) {
    throw new BGAuthError('invalid_signature', 'Token signature verification failed');
  }

  // Decode payload
  const payload: BGAccessTokenPayload = JSON.parse(base64urlDecode(payloadB64));
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockTolerance ?? 30; // 30 second clock skew tolerance

  // Validate standard claims
  if (payload.exp && payload.exp + tolerance < now) {
    throw new BGAuthError('token_expired', 'Token has expired');
  }
  if (payload.nbf && payload.nbf - tolerance > now) {
    throw new BGAuthError('token_not_yet_valid', 'Token is not yet valid');
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new BGAuthError('invalid_issuer', `Expected issuer ${options.issuer}, got ${payload.iss}`);
  }
  if (options.audience && payload.aud !== options.audience) {
    throw new BGAuthError('invalid_audience', `Expected audience ${options.audience}, got ${payload.aud}`);
  }

  return payload;
}

// ============================================================
// Self-Signed Tokens (Decentralized Mode)
// ============================================================

/**
 * Create a self-signed token using BIP-322.
 *
 * This allows agents to create tokens that can be verified directly
 * against the Bitcoin blockchain, without depending on a BG Auth server.
 *
 * The relying party verifies by:
 * 1. Checking the BIP-322 signature
 * 2. Looking up the Bitmap ownership on-chain
 * 3. Generating the genome from block data to confirm the genome_id
 *
 * @param payload - Token payload (agent fills in their own data)
 * @param bitcoinAddress - The agent's Bitcoin address (owns the Bitmap)
 * @param signMessage - Function to sign a message with BIP-322
 * @returns Self-signed JWT string
 */
export async function createSelfSignedToken(
  payload: Omit<BGAccessTokenPayload, 'iss' | 'iat' | 'exp' | 'nbf' | 'jti'>,
  bitcoinAddress: string,
  signMessage: (message: string) => Promise<string>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: BGAccessTokenPayload = {
    ...payload,
    iss: `self:${bitcoinAddress}`,
    iat: now,
    exp: now + TOKEN_CONFIG.ACCESS_TOKEN_TTL,
    nbf: now,
    jti: TOKEN_CONFIG.ACCESS_TOKEN_PREFIX + randomHex(16),
  };

  const header: BGTokenHeader = {
    alg: 'BIP322',
    typ: 'JWT',
    kid: bitcoinAddress,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with BIP-322 (the agent's Bitcoin wallet)
  const signature = await signMessage(signingInput);
  const signatureB64 = base64urlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

// ============================================================
// Challenge Generation
// ============================================================

/** Server-side challenge record */
export interface BGChallengeRecord {
  /** Unique challenge identifier */
  challenge_id: string;
  /** The human-readable challenge message to sign */
  message: string;
  /** Random nonce embedded in the message */
  nonce: string;
  /** Genome ID of the agent being challenged */
  genome_id: string;
  /** Client requesting the challenge */
  client_id: string;
  /** Scopes requested */
  scopes: BGScope[];
  /** Creation timestamp */
  created_at: number;
  /** Expiration timestamp */
  expires_at: number;
  /** Whether this challenge has been used */
  used: boolean;
}

/**
 * Generate an authentication challenge for the API flow.
 *
 * The challenge is a human-readable message that the agent signs with BIP-322.
 * It includes a nonce, timestamp, and the requesting application's identity
 * so the agent can see exactly what they're authorizing.
 *
 * @param genomeId - The agent's genome ID
 * @param clientId - The requesting application's client ID
 * @param clientName - Human-readable name of the requesting app
 * @param scopes - Requested scopes
 * @returns Challenge record to store server-side, and message for the agent
 */
export function generateChallenge(
  genomeId: string,
  clientId: string,
  clientName: string,
  scopes: BGScope[],
): BGChallengeRecord {
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomHex(16);
  const challengeId = TOKEN_CONFIG.CHALLENGE_PREFIX + randomHex(12);

  const message = [
    'Block Genomics Auth Challenge',
    '===============================',
    `Action: authenticate`,
    `Genome: ${genomeId}`,
    `Client: ${clientId}`,
    `Scopes: ${scopes.join(' ')}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${new Date(now * 1000).toISOString()}`,
    `Expires: ${new Date((now + TOKEN_CONFIG.CHALLENGE_TTL) * 1000).toISOString()}`,
    '===============================',
    `Sign this message to authenticate with ${clientName}.`,
  ].join('\n');

  return {
    challenge_id: challengeId,
    message,
    nonce,
    genome_id: genomeId,
    client_id: clientId,
    scopes,
    created_at: now,
    expires_at: now + TOKEN_CONFIG.CHALLENGE_TTL,
    used: false,
  };
}

// ============================================================
// Refresh Token Generation
// ============================================================

/**
 * Generate a new refresh token.
 *
 * @param genomeId - The agent's genome ID
 * @param clientId - The relying party's client ID
 * @param scopes - Granted scopes
 * @param familyId - Token family ID (new family for initial auth, same for rotation)
 * @param meta - Request metadata for audit
 * @returns Refresh token record
 */
export function generateRefreshToken(
  genomeId: string,
  clientId: string,
  scopes: BGScope[],
  familyId: string | null,
  meta: { ip: string; userAgent: string },
): BGRefreshTokenRecord {
  const now = Math.floor(Date.now() / 1000);

  return {
    token: TOKEN_CONFIG.REFRESH_TOKEN_PREFIX + randomHex(32),
    genome_id: genomeId,
    client_id: clientId,
    scopes,
    created_at: now,
    expires_at: now + TOKEN_CONFIG.REFRESH_TOKEN_TTL,
    family_id: familyId ?? randomHex(16),
    rotated: false,
    replaced_by: null,
    created_ip: meta.ip,
    created_ua: meta.userAgent,
  };
}

// ============================================================
// Utility Functions
// ============================================================

/** Custom error class for BG Auth token operations */
export class BGAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BGAuthError';
  }
}

/** Generate random hex string of given byte length */
function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Base64url encode a string or buffer */
function base64urlEncode(input: string | Uint8Array): string {
  const str = typeof input === 'string' ? input : new TextDecoder().decode(input);
  // Node.js
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  // Browser
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Base64url decode to string */
function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const base64 = pad ? padded + '='.repeat(4 - pad) : padded;
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  return atob(base64);
}

/**
 * ES256K sign (placeholder — use @noble/secp256k1 or similar in production).
 *
 * This is a structural placeholder. In production, replace with:
 *
 * ```ts
 * import * as secp256k1 from '@noble/secp256k1';
 * import { sha256 } from '@noble/hashes/sha256';
 *
 * async function es256kSign(message: string, privateKeyHex: string): Promise<Uint8Array> {
 *   const msgHash = sha256(new TextEncoder().encode(message));
 *   return secp256k1.sign(msgHash, privateKeyHex).toCompactRawBytes();
 * }
 * ```
 */
async function es256kSign(message: string, _privateKeyHex: string): Promise<Uint8Array> {
  // Production: use @noble/secp256k1
  const msgBuffer = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', msgBuffer);
  // Placeholder: return hash as "signature" — REPLACE IN PRODUCTION
  return new Uint8Array(hash);
}

/**
 * ES256K verify (placeholder — use @noble/secp256k1 or similar in production).
 */
async function es256kVerify(
  _message: string,
  _signature: string | Uint8Array,
  _publicKeyHex: string,
): Promise<boolean> {
  // Production: use @noble/secp256k1
  // Placeholder: always returns true — REPLACE IN PRODUCTION
  return true;
}
