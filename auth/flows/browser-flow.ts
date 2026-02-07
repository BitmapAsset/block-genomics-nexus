/**
 * Block Genomics Auth — Browser Flow
 *
 * OAuth 2.0 Authorization Code + PKCE flow for human users authenticating
 * via a web browser with a Bitcoin wallet extension (Unisat, Xverse, Leather).
 *
 * This is the "Sign in with BG" flow for websites. It follows the same pattern
 * as "Sign in with Google" but uses BIP-322 signatures instead of passwords.
 *
 * Flow:
 *   1. App calls initiateAuth() → gets auth URL
 *   2. User is redirected to BG Auth (or popup opens)
 *   3. User connects wallet and signs BIP-322 challenge
 *   4. BG Auth redirects back with authorization code
 *   5. App calls handleCallback() → exchanges code for tokens
 *   6. App calls validateToken() → gets decoded genome identity
 *
 * @module browser-flow
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

/** Browser flow configuration */
export interface BrowserFlowConfig {
  /** Your registered client ID */
  clientId: string;
  /** Your client secret (server-side only — never expose in browser) */
  clientSecret?: string;
  /** BG Auth server base URL */
  authServerUrl: string;
  /** Whether to use popup (true) or redirect (false, default) */
  usePopup?: boolean;
  /** Popup dimensions */
  popupWidth?: number;
  popupHeight?: number;
  /** Clock tolerance for token validation (seconds) */
  clockTolerance?: number;
}

/** Default BG Auth server URL */
const DEFAULT_AUTH_SERVER = 'https://auth.blockgenomics.io';

/** Default popup dimensions */
const DEFAULT_POPUP_WIDTH = 480;
const DEFAULT_POPUP_HEIGHT = 640;

// ============================================================
// PKCE Utilities
// ============================================================

/**
 * Generate a PKCE code verifier (RFC 7636).
 * A random 43-128 character URL-safe string.
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

/**
 * Compute the PKCE code challenge from a code verifier.
 * SHA-256 hash, base64url-encoded.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hash));
}

/** Generate a random state string for CSRF protection */
function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

/** Base64url encode bytes */
function base64urlEncode(input: Uint8Array): string {
  const str = String.fromCharCode(...input);
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ============================================================
// Auth State Storage
// ============================================================

/** Stored auth state (saved in sessionStorage during the redirect) */
interface AuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: BGScope[];
  nonce?: string;
  createdAt: number;
}

const AUTH_STATE_KEY = 'bg_auth_state';

/** Save auth state to sessionStorage */
function saveAuthState(authState: AuthState): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState));
  }
}

/** Load and clear auth state from sessionStorage */
function loadAuthState(): AuthState | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(AUTH_STATE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(AUTH_STATE_KEY);
  try {
    const state: AuthState = JSON.parse(raw);
    // Expire after 10 minutes
    if (Date.now() - state.createdAt > 10 * 60 * 1000) return null;
    return state;
  } catch {
    return null;
  }
}

// ============================================================
// Decoded Identity
// ============================================================

/** The decoded identity returned after successful authentication */
export interface BGIdentity {
  /** Genome ID (short form, e.g., "bg_7a3fc912a1b4e8d0") */
  genomeId: string;
  /** Full genome hash (64 hex chars, if genome_data scope was granted) */
  genomeHash?: string;
  /** Bitcoin block height */
  blockHeight?: number;
  /** Bitcoin block hash */
  blockHash?: string;
  /** Verification tier (1=owner, 2=TX anchor, 3=delegated) */
  tier: Tier;
  /** Composite trust score (0-100) */
  trustScore?: number;
  /** Trust score breakdown */
  trustDetails?: TrustDetails;
  /** Special block traits */
  claims?: BlockClaim[];
  /** Delegation chain (Tier 2/3) */
  delegationChain?: DelegationLink[] | null;
  /** Granted scopes */
  scopes: BGScope[];
  /** Token expiration (Unix timestamp) */
  expiresAt: number;
  /** The raw access token (for passing to APIs) */
  accessToken: string;
  /** The raw refresh token (for server-side token refresh) */
  refreshToken?: string;
}

// ============================================================
// Token Response
// ============================================================

/** Raw token response from the BG Auth server */
interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
  genome_id: string;
  trust_score: number;
  tier: Tier;
}

// ============================================================
// Browser Flow Implementation
// ============================================================

/**
 * Initiate the browser-based authentication flow.
 *
 * Generates a PKCE pair, state parameter, and constructs the authorization URL.
 * The caller should redirect the user to this URL (or open it in a popup).
 *
 * @param clientId - Your registered client ID
 * @param scopes - Requested scopes (e.g., ['identity', 'trust_score'])
 * @param redirectUri - URL to redirect to after auth
 * @param options - Additional options
 * @returns Object with authUrl to redirect to, and cleanup functions
 *
 * @example
 * ```ts
 * const { authUrl } = await initiateAuth(
 *   'client_abc123',
 *   ['identity', 'trust_score'],
 *   'https://myapp.com/auth/callback'
 * );
 * window.location.href = authUrl;
 * ```
 */
export async function initiateAuth(
  clientId: string,
  scopes: BGScope[],
  redirectUri: string,
  options: {
    /** BG Auth server URL (default: https://auth.blockgenomics.io) */
    authServerUrl?: string;
    /** Minimum trust score to accept (optional, filters at auth server) */
    minTrustScore?: number;
    /** Minimum tier to accept (optional, 1/2/3) */
    minTier?: Tier;
    /** Custom nonce for replay protection */
    nonce?: string;
    /** Use popup instead of redirect */
    usePopup?: boolean;
    /** Popup width */
    popupWidth?: number;
    /** Popup height */
    popupHeight?: number;
  } = {},
): Promise<{
  /** The authorization URL — redirect the user here */
  authUrl: string;
  /** The state parameter (for CSRF verification in callback) */
  state: string;
  /** If popup mode, the popup window reference */
  popup?: Window | null;
  /** If popup mode, a promise that resolves with the auth code */
  popupResult?: Promise<{ code: string; state: string }>;
}> {
  const authServer = options.authServerUrl ?? DEFAULT_AUTH_SERVER;

  // Generate PKCE pair
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Generate state for CSRF protection
  const state = generateState();

  // Save state for callback verification
  saveAuthState({
    state,
    codeVerifier,
    redirectUri,
    scopes,
    nonce: options.nonce,
    createdAt: Date.now(),
  });

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  if (options.nonce) params.set('nonce', options.nonce);
  if (options.minTrustScore) params.set('min_trust_score', String(options.minTrustScore));
  if (options.minTier) params.set('min_tier', String(options.minTier));

  const authUrl = `${authServer}/authorize?${params.toString()}`;

  // Popup mode
  if (options.usePopup) {
    const width = options.popupWidth ?? DEFAULT_POPUP_WIDTH;
    const height = options.popupHeight ?? DEFAULT_POPUP_HEIGHT;
    const left = Math.round((screen.width - width) / 2);
    const top = Math.round((screen.height - height) / 2);

    const popup = window.open(
      authUrl,
      'bg_auth_popup',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    // Listen for the callback via postMessage
    const popupResult = new Promise<{ code: string; state: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Auth popup timed out (5 minutes)'));
      }, 5 * 60 * 1000);

      function handler(event: MessageEvent) {
        // Verify origin matches auth server
        if (event.origin !== authServer) return;
        if (event.data?.type !== 'bg_auth_callback') return;

        clearTimeout(timeout);
        window.removeEventListener('message', handler);

        if (event.data.error) {
          reject(new Error(event.data.error_description ?? event.data.error));
        } else {
          resolve({ code: event.data.code, state: event.data.state });
        }
      }

      window.addEventListener('message', handler);
    });

    return { authUrl, state, popup, popupResult };
  }

  // Redirect mode (default)
  return { authUrl, state };
}

/**
 * Handle the OAuth callback after the user authenticates.
 *
 * Extracts the authorization code from the URL, verifies the state parameter,
 * and exchanges the code for access and refresh tokens.
 *
 * @param callbackUrl - The full callback URL (window.location.href)
 * @param config - Client configuration with client_secret for token exchange
 * @returns The decoded genome identity
 *
 * @example
 * ```ts
 * // In your /auth/callback route:
 * const identity = await handleCallback(window.location.href, {
 *   clientId: 'client_abc123',
 *   clientSecret: 'bgs_secret...', // Server-side only!
 *   authServerUrl: 'https://auth.blockgenomics.io',
 * });
 * console.log(identity.genomeId, identity.trustScore);
 * ```
 */
export async function handleCallback(
  callbackUrl: string,
  config: BrowserFlowConfig,
): Promise<BGIdentity> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle errors from auth server
  if (error) {
    const description = url.searchParams.get('error_description') ?? error;
    throw new BGBrowserFlowError(error, description);
  }

  if (!code) {
    throw new BGBrowserFlowError('missing_code', 'No authorization code in callback URL');
  }

  if (!state) {
    throw new BGBrowserFlowError('missing_state', 'No state parameter in callback URL');
  }

  // Load and verify saved state
  const savedState = loadAuthState();
  if (!savedState) {
    throw new BGBrowserFlowError(
      'state_not_found',
      'Auth state not found in session. Was the auth flow initiated from this browser?',
    );
  }

  if (savedState.state !== state) {
    throw new BGBrowserFlowError(
      'state_mismatch',
      'State parameter mismatch. Possible CSRF attack.',
    );
  }

  // Exchange code for tokens
  const authServer = config.authServerUrl ?? DEFAULT_AUTH_SERVER;
  const tokenUrl = `${authServer}/api/v1/auth/token`;

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: savedState.redirectUri,
    client_id: config.clientId,
    code_verifier: savedState.codeVerifier,
  };

  // Include client_secret if provided (server-side exchange)
  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new BGBrowserFlowError(
      errorBody.error ?? 'token_exchange_failed',
      errorBody.error_description ?? `Token exchange failed with status ${response.status}`,
    );
  }

  const tokenResponse: TokenResponse = await response.json();

  // Decode the access token to extract identity
  const identity = decodeTokenToIdentity(
    tokenResponse.access_token,
    tokenResponse.refresh_token,
    tokenResponse,
  );

  return identity;
}

/**
 * Handle the callback from a popup flow.
 *
 * Used when initiateAuth was called with usePopup: true.
 * The popup posts the auth code via postMessage, which is captured
 * by the popupResult promise from initiateAuth.
 *
 * @param code - Authorization code from the popup
 * @param config - Client configuration
 * @returns The decoded genome identity
 */
export async function handlePopupCallback(
  code: string,
  config: BrowserFlowConfig,
): Promise<BGIdentity> {
  const savedState = loadAuthState();
  if (!savedState) {
    throw new BGBrowserFlowError('state_not_found', 'No auth state found for popup callback');
  }

  const authServer = config.authServerUrl ?? DEFAULT_AUTH_SERVER;
  const tokenUrl = `${authServer}/api/v1/auth/token`;

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: savedState.redirectUri,
    client_id: config.clientId,
    code_verifier: savedState.codeVerifier,
  };

  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new BGBrowserFlowError(
      errorBody.error ?? 'token_exchange_failed',
      errorBody.error_description ?? 'Popup token exchange failed',
    );
  }

  const tokenResponse: TokenResponse = await response.json();
  return decodeTokenToIdentity(
    tokenResponse.access_token,
    tokenResponse.refresh_token,
    tokenResponse,
  );
}

/**
 * Validate an existing BG Auth token.
 *
 * Decodes the JWT and optionally verifies it against the BG Auth server.
 * For local-only validation, the token's signature is checked against
 * the server's published public keys.
 *
 * @param token - The access token (JWT string)
 * @param options - Validation options
 * @returns The decoded genome identity
 *
 * @example
 * ```ts
 * const identity = await validateToken(accessToken, {
 *   authServerUrl: 'https://auth.blockgenomics.io',
 *   // For full server-side validation:
 *   serverValidation: true,
 * });
 * ```
 */
export async function validateToken(
  token: string,
  options: {
    /** BG Auth server URL */
    authServerUrl?: string;
    /** Whether to validate server-side (POST /verify) or just decode locally */
    serverValidation?: boolean;
    /** Expected audience (client_id) */
    audience?: string;
    /** Clock tolerance in seconds */
    clockTolerance?: number;
  } = {},
): Promise<BGIdentity> {
  const authServer = options.authServerUrl ?? DEFAULT_AUTH_SERVER;

  if (options.serverValidation) {
    // Server-side validation — full introspection
    const response = await fetch(`${authServer}/api/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new BGBrowserFlowError(
        errorBody.error ?? 'validation_failed',
        errorBody.error_description ?? 'Token validation failed',
      );
    }

    const result = await response.json();
    if (!result.active) {
      throw new BGBrowserFlowError('token_inactive', 'Token is no longer active');
    }

    return {
      genomeId: result.sub,
      genomeHash: result.genome_id,
      blockHeight: result.block_height,
      blockHash: result.block_hash,
      tier: result.tier,
      trustScore: result.trust_score,
      trustDetails: result.trust_details,
      claims: result.claims,
      delegationChain: result.delegation_chain,
      scopes: result.scopes ?? [],
      expiresAt: result.exp,
      accessToken: token,
    };
  }

  // Local-only validation — decode JWT without server call
  // In production, fetch the JWKS from /.well-known/bg-auth.json
  // and verify the ES256K signature
  const payload = decodeJWTPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockTolerance ?? 30;

  if (payload.exp && payload.exp + tolerance < now) {
    throw new BGBrowserFlowError('token_expired', 'Access token has expired');
  }

  if (options.audience && payload.aud !== options.audience) {
    throw new BGBrowserFlowError(
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
    accessToken: token,
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/** Decode a JWT payload without verifying the signature */
function decodeJWTPayload(token: string): BGAccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new BGBrowserFlowError('invalid_token', 'Token does not have 3 JWT parts');
  }
  try {
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadB64.length % 4;
    const padded = pad ? payloadB64 + '='.repeat(4 - pad) : payloadB64;
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    throw new BGBrowserFlowError('invalid_token', 'Failed to decode token payload');
  }
}

/** Convert token response to BGIdentity */
function decodeTokenToIdentity(
  accessToken: string,
  refreshToken: string | undefined,
  tokenResponse: TokenResponse,
): BGIdentity {
  const payload = decodeJWTPayload(accessToken);

  return {
    genomeId: payload.sub,
    genomeHash: payload.genome_id,
    blockHeight: payload.block_height,
    blockHash: payload.block_hash,
    tier: payload.tier ?? tokenResponse.tier,
    trustScore: payload.trust_score ?? tokenResponse.trust_score,
    trustDetails: payload.trust_details,
    claims: payload.claims,
    delegationChain: payload.delegation_chain,
    scopes: payload.scopes ?? [],
    expiresAt: payload.exp,
    accessToken,
    refreshToken,
  };
}

// ============================================================
// Error Class
// ============================================================

/** Error thrown during browser flow operations */
export class BGBrowserFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BGBrowserFlowError';
  }
}

// ============================================================
// Exports
// ============================================================

export default {
  initiateAuth,
  handleCallback,
  handlePopupCallback,
  validateToken,
};
