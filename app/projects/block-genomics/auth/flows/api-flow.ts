/**
 * Block Genomics Auth — API Flow (Challenge-Response)
 *
 * Server-to-server authentication for AI agents and automated systems.
 * No browser or human interaction required.
 *
 * This is the primary auth flow for AI agents. The agent proves ownership
 * of a Bitcoin block (and its associated genome) by signing a challenge
 * message with its BIP-322 private key.
 *
 * Flow:
 *   1. Agent/server calls requestChallenge(genomeId) → gets challenge message
 *   2. Agent signs the challenge with its BIP-322 key
 *   3. Agent/server calls submitProof(genomeId, signature) → gets auth token
 *   4. Token can be verified locally or via verifyToken()
 *
 * @module api-flow
 */

import type {
  BGAccessTokenPayload,
  BGScope,
  Tier,
  TrustDetails,
  BlockClaim,
  DelegationLink,
} from '../token-spec';

// ============================================================
// Configuration
// ============================================================

/** API flow configuration */
export interface APIFlowConfig {
  /** Your registered client ID */
  clientId: string;
  /** Your client secret (required for server-to-server) */
  clientSecret: string;
  /** BG Auth server base URL */
  authServerUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom fetch implementation (for Node.js environments) */
  fetchFn?: typeof fetch;
}

/** Default configuration values */
const DEFAULTS = {
  AUTH_SERVER_URL: 'https://auth.blockgenomics.io',
  TIMEOUT_MS: 30_000,
} as const;

// ============================================================
// Types
// ============================================================

/** Challenge returned by the BG Auth server */
export interface BGChallenge {
  /** Unique challenge identifier (used in submitProof) */
  challengeId: string;
  /** Human-readable challenge message to sign with BIP-322 */
  message: string;
  /** Nonce embedded in the challenge */
  nonce: string;
  /** When the challenge expires (ISO 8601) */
  expiresAt: string;
}

/** Authentication token pair returned after successful proof */
export interface BGAuthTokens {
  /** JWT access token */
  accessToken: string;
  /** Token type (always "Bearer") */
  tokenType: 'Bearer';
  /** Seconds until access token expires */
  expiresIn: number;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** Space-separated list of granted scopes */
  scope: string;
  /** Agent's genome ID */
  genomeId: string;
  /** Agent's current trust score */
  trustScore: number;
  /** Agent's verification tier */
  tier: Tier;
}

/** Decoded agent identity from a verified token */
export interface BGAgentIdentity {
  /** Genome ID (short form, e.g., "bg_7a3fc912a1b4e8d0") */
  genomeId: string;
  /** Full genome hash (if genome_data scope granted) */
  genomeHash?: string;
  /** Bitcoin block height */
  blockHeight?: number;
  /** Bitcoin block hash */
  blockHash?: string;
  /** Verification tier */
  tier: Tier;
  /** Trust score (0-100) */
  trustScore?: number;
  /** Trust score breakdown */
  trustDetails?: TrustDetails;
  /** Special block claims */
  claims?: BlockClaim[];
  /** Delegation chain */
  delegationChain?: DelegationLink[] | null;
  /** Granted scopes */
  scopes: BGScope[];
  /** Token expiration (Unix timestamp) */
  expiresAt: number;
  /** Whether the token is currently valid */
  active: boolean;
}

// ============================================================
// API Flow Implementation
// ============================================================

/**
 * Request an authentication challenge for a genome.
 *
 * The BG Auth server generates a unique challenge message containing
 * a nonce, timestamp, and the requesting client's identity. The agent
 * must sign this message with the BIP-322 key associated with their
 * Bitmap inscription.
 *
 * @param genomeId - The agent's genome ID (e.g., "bg_7a3fc912a1b4e8d0")
 * @param config - API flow configuration
 * @param options - Additional challenge options
 * @returns Challenge object with the message to sign
 *
 * @example
 * ```ts
 * const challenge = await requestChallenge('bg_7a3fc912a1b4e8d0', {
 *   clientId: 'client_abc123',
 *   clientSecret: 'bgs_secret...',
 * });
 * console.log(challenge.message); // "Block Genomics Auth Challenge\n..."
 * ```
 */
export async function requestChallenge(
  genomeId: string,
  config: APIFlowConfig,
  options: {
    /** Requested scopes */
    scopes?: BGScope[];
  } = {},
): Promise<BGChallenge> {
  const authServer = config.authServerUrl ?? DEFAULTS.AUTH_SERVER_URL;
  const fetchFn = config.fetchFn ?? fetch;
  const scopes = options.scopes ?? ['identity', 'trust_score'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULTS.TIMEOUT_MS);

  try {
    const response = await fetchFn(`${authServer}/api/v1/auth/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      },
      body: JSON.stringify({
        genome_id: genomeId,
        client_id: config.clientId,
        scopes,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BGAPIFlowError(
        error.error ?? 'challenge_failed',
        error.error_description ?? `Challenge request failed with status ${response.status}`,
      );
    }

    const data = await response.json();

    return {
      challengeId: data.challenge_id,
      message: data.message,
      nonce: data.nonce,
      expiresAt: data.expires_at,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Submit a signed challenge proof and receive authentication tokens.
 *
 * After the agent signs the challenge message with BIP-322, submit
 * the signature here to complete authentication. The BG Auth server
 * verifies:
 *   1. The challenge is valid and not expired
 *   2. The BIP-322 signature is correct
 *   3. The signer owns the Bitmap inscription
 *   4. The genome matches the claimed genome ID
 *
 * @param genomeId - The agent's genome ID
 * @param signedChallenge - Object containing the challenge ID and BIP-322 signature
 * @param config - API flow configuration
 * @returns Authentication tokens (access + refresh)
 *
 * @example
 * ```ts
 * // Sign the challenge with your BIP-322 key
 * const signature = await wallet.signMessage(challenge.message, 'bip322-simple');
 *
 * const tokens = await submitProof('bg_7a3fc912a1b4e8d0', {
 *   challengeId: challenge.challengeId,
 *   signature,
 * }, config);
 *
 * console.log(tokens.accessToken); // JWT
 * console.log(tokens.trustScore);  // 94
 * ```
 */
export async function submitProof(
  genomeId: string,
  signedChallenge: {
    /** Challenge ID from requestChallenge */
    challengeId: string;
    /** BIP-322 signature of the challenge message */
    signature: string;
    /** Bitcoin address used for signing (optional, for additional verification) */
    signerAddress?: string;
  },
  config: APIFlowConfig,
): Promise<BGAuthTokens> {
  const authServer = config.authServerUrl ?? DEFAULTS.AUTH_SERVER_URL;
  const fetchFn = config.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULTS.TIMEOUT_MS);

  try {
    const response = await fetchFn(`${authServer}/api/v1/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'bg_challenge',
        challenge_id: signedChallenge.challengeId,
        signature: signedChallenge.signature,
        genome_id: genomeId,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        signer_address: signedChallenge.signerAddress,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BGAPIFlowError(
        error.error ?? 'proof_failed',
        error.error_description ?? `Proof submission failed with status ${response.status}`,
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      tokenType: 'Bearer',
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
      scope: data.scope,
      genomeId: data.genome_id,
      trustScore: data.trust_score,
      tier: data.tier,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verify an access token and extract the agent's identity.
 *
 * Can verify locally (decode JWT + check expiry) or server-side
 * (full introspection including revocation check).
 *
 * @param token - The JWT access token to verify
 * @param options - Verification options
 * @returns The decoded agent identity
 *
 * @example
 * ```ts
 * // Local verification (fast, no network call)
 * const identity = await verifyToken(token, { mode: 'local' });
 *
 * // Server verification (full check including revocation)
 * const identity = await verifyToken(token, {
 *   mode: 'server',
 *   config: { clientId: '...', clientSecret: '...' },
 * });
 * ```
 */
export async function verifyToken(
  token: string,
  options: {
    /** Verification mode: 'local' (decode only) or 'server' (full introspection) */
    mode?: 'local' | 'server';
    /** Config required for server-mode verification */
    config?: APIFlowConfig;
    /** Expected audience (client_id) for local verification */
    audience?: string;
    /** Clock tolerance in seconds for local verification */
    clockTolerance?: number;
  } = {},
): Promise<BGAgentIdentity> {
  const mode = options.mode ?? 'local';

  if (mode === 'server') {
    if (!options.config) {
      throw new BGAPIFlowError(
        'missing_config',
        'APIFlowConfig is required for server-mode verification',
      );
    }

    const authServer = options.config.authServerUrl ?? DEFAULTS.AUTH_SERVER_URL;
    const fetchFn = options.config.fetchFn ?? fetch;

    const response = await fetchFn(`${authServer}/api/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${options.config.clientId}:${options.config.clientSecret}`)}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BGAPIFlowError(
        error.error ?? 'verification_failed',
        error.error_description ?? 'Server-side token verification failed',
      );
    }

    const data = await response.json();

    return {
      genomeId: data.sub,
      genomeHash: data.genome_id,
      blockHeight: data.block_height,
      blockHash: data.block_hash,
      tier: data.tier,
      trustScore: data.trust_score,
      trustDetails: data.trust_details,
      claims: data.claims,
      delegationChain: data.delegation_chain,
      scopes: data.scopes ?? [],
      expiresAt: data.exp,
      active: data.active,
    };
  }

  // Local verification — decode JWT and check claims
  const payload = decodeJWTPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockTolerance ?? 30;

  const active = !payload.exp || payload.exp + tolerance >= now;

  if (options.audience && payload.aud !== options.audience) {
    throw new BGAPIFlowError(
      'invalid_audience',
      `Token audience ${payload.aud} does not match expected ${options.audience}`,
    );
  }

  return {
    genomeId: payload.sub,
    genomeHash: payload.genome_id,
    blockHeight: payload.block_height,
    blockHash: payload.block_hash,
    tier: payload.tier ?? 1,
    trustScore: payload.trust_score,
    trustDetails: payload.trust_details,
    claims: payload.claims,
    delegationChain: payload.delegation_chain,
    scopes: payload.scopes ?? [],
    expiresAt: payload.exp,
    active,
  };
}

/**
 * Refresh an expired access token using a refresh token.
 *
 * @param refreshToken - The refresh token string
 * @param config - API flow configuration
 * @returns New authentication tokens
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: APIFlowConfig,
): Promise<BGAuthTokens> {
  const authServer = config.authServerUrl ?? DEFAULTS.AUTH_SERVER_URL;
  const fetchFn = config.fetchFn ?? fetch;

  const response = await fetchFn(`${authServer}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new BGAPIFlowError(
      error.error ?? 'refresh_failed',
      error.error_description ?? 'Token refresh failed',
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    tokenType: 'Bearer',
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    scope: data.scope,
    genomeId: data.genome_id,
    trustScore: data.trust_score,
    tier: data.tier,
  };
}

/**
 * Revoke a refresh token (sign out / invalidate session).
 *
 * @param refreshToken - The refresh token to revoke
 * @param config - API flow configuration
 */
export async function revokeToken(
  refreshToken: string,
  config: APIFlowConfig,
): Promise<void> {
  const authServer = config.authServerUrl ?? DEFAULTS.AUTH_SERVER_URL;
  const fetchFn = config.fetchFn ?? fetch;

  const response = await fetchFn(`${authServer}/api/v1/auth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  // Revocation endpoint should return 200 even if token was already revoked
  if (!response.ok && response.status !== 200) {
    const error = await response.json().catch(() => ({}));
    throw new BGAPIFlowError(
      error.error ?? 'revocation_failed',
      error.error_description ?? 'Token revocation failed',
    );
  }
}

// ============================================================
// Convenience: Full Auth Flow
// ============================================================

/**
 * Perform the complete API authentication flow in one call.
 *
 * Requests a challenge, delegates signing to the provided signFn,
 * and submits the proof. Returns the auth tokens.
 *
 * @param genomeId - The agent's genome ID
 * @param signFn - Function that signs a message with BIP-322
 * @param config - API flow configuration
 * @param options - Additional options
 * @returns Authentication tokens
 *
 * @example
 * ```ts
 * import { authenticate } from '@blockgenomics/auth/flows/api-flow';
 * import { signWithBIP322 } from './my-wallet';
 *
 * const tokens = await authenticate(
 *   'bg_7a3fc912a1b4e8d0',
 *   (message) => signWithBIP322(message, myPrivateKey),
 *   {
 *     clientId: 'client_abc123',
 *     clientSecret: 'bgs_secret...',
 *   },
 * );
 * ```
 */
export async function authenticate(
  genomeId: string,
  signFn: (message: string) => Promise<string>,
  config: APIFlowConfig,
  options: {
    scopes?: BGScope[];
  } = {},
): Promise<BGAuthTokens> {
  // Step 1: Request challenge
  const challenge = await requestChallenge(genomeId, config, {
    scopes: options.scopes,
  });

  // Step 2: Sign the challenge
  const signature = await signFn(challenge.message);

  // Step 3: Submit proof
  const tokens = await submitProof(
    genomeId,
    { challengeId: challenge.challengeId, signature },
    config,
  );

  return tokens;
}

// ============================================================
// Internal Helpers
// ============================================================

/** Decode JWT payload without signature verification */
function decodeJWTPayload(token: string): BGAccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new BGAPIFlowError('invalid_token', 'Token is not a valid JWT');
  }
  try {
    let payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadB64.length % 4;
    if (pad) payloadB64 += '='.repeat(4 - pad);

    // Works in both Node.js and browser
    let decoded: string;
    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(payloadB64, 'base64').toString('utf8');
    } else {
      decoded = atob(payloadB64);
    }

    return JSON.parse(decoded);
  } catch {
    throw new BGAPIFlowError('invalid_token', 'Failed to decode JWT payload');
  }
}

/** Base64 encode for Basic auth (works in Node.js and browser) */
function btoa(str: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(str);
  }
  // Node.js fallback
  return Buffer.from(str).toString('base64');
}

// ============================================================
// Error Class
// ============================================================

/** Error thrown during API flow operations */
export class BGAPIFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BGAPIFlowError';
  }
}

// ============================================================
// Exports
// ============================================================

export default {
  requestChallenge,
  submitProof,
  verifyToken,
  refreshAccessToken,
  revokeToken,
  authenticate,
};
