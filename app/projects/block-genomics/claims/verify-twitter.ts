/**
 * Block Genomics — Twitter/X Claim Verifier
 *
 * Verifies ownership of an X/Twitter account via OAuth 2.0 PKCE flow.
 *
 * Flow:
 * 1. Agent provides their Twitter handle
 * 2. System generates an OAuth 2.0 authorization URL (PKCE flow)
 * 3. Agent authorizes the Block Genomics app on X
 * 4. Callback provides auth code → system exchanges for token → reads profile
 * 5. If authenticated username matches claimed handle → verified
 *
 * Security considerations:
 * - PKCE (Proof Key for Code Exchange) prevents authorization code interception
 * - OAuth state parameter bound to agent genome + nonce
 * - Access tokens are short-lived; only the hash is stored as proof
 * - Handle changes detected during 30-day re-verification
 * - Suspended/deactivated accounts caught during re-check
 * - Rate limited to 3 attempts per hour
 *
 * Prerequisites:
 * - Twitter/X Developer App with OAuth 2.0 enabled
 * - Callback URL registered: https://verify.blockgenomics.io/api/v1/claims/twitter/callback
 * - Scopes: tweet.read, users.read (read-only — we never post)
 *
 * @module verify-twitter
 */

import { createHash, randomBytes } from 'crypto';
import type {
  ClaimVerifier,
  TwitterChallenge,
  TwitterProof,
  VerificationResult,
  RecheckResult,
  VerifiedClaim,
} from './types';
import { ClaimType, VerificationErrorCode } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface TwitterOAuthConfig {
  /** Twitter/X OAuth 2.0 Client ID */
  clientId: string;
  /** Twitter/X OAuth 2.0 Client Secret */
  clientSecret: string;
  /** Registered callback URL */
  callbackUrl: string;
  /** OAuth scopes to request */
  scopes?: string[];
}

/** Default OAuth scopes — read-only, minimal permissions */
const DEFAULT_SCOPES = ['tweet.read', 'users.read'];

/** Twitter API base URLs */
const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_USER_URL = 'https://api.twitter.com/2/users/me';
const TWITTER_USER_BY_USERNAME_URL = 'https://api.twitter.com/2/users/by/username';

// =============================================================================
// TWITTER CLAIM VERIFIER
// =============================================================================

/**
 * Verifier for X/Twitter claims.
 *
 * @example
 * ```ts
 * const verifier = new TwitterClaimVerifier({
 *   clientId: process.env.TWITTER_CLIENT_ID!,
 *   clientSecret: process.env.TWITTER_CLIENT_SECRET!,
 *   callbackUrl: 'https://verify.blockgenomics.io/api/v1/claims/twitter/callback',
 * });
 *
 * // Step 1: Generate challenge (returns OAuth URL)
 * const challenge = await verifier.generateChallenge({
 *   claimId: 'clm_abc123',
 *   agentId: 'bg_deadbeef',
 *   genome: 'a3f7...b2c4',
 *   claimValue: 'elonmusk',
 *   nonce: 'randomhex32chars...',
 * });
 * // → Redirect user to challenge.authorizationUrl
 *
 * // Step 2: After OAuth callback, submit proof
 * const result = await verifier.verifyProof(challenge, {
 *   claimId: 'clm_abc123',
 *   nonce: challenge.nonce,
 *   proofType: 'oauth_token',
 *   authorizationCode: 'code_from_callback',
 *   state: 'state_from_callback',
 *   codeVerifier: challenge.codeVerifier,
 * });
 * ```
 */
export class TwitterClaimVerifier implements ClaimVerifier<TwitterChallenge, TwitterProof> {
  readonly claimType = ClaimType.TWITTER;

  private config: TwitterOAuthConfig;

  constructor(config: TwitterOAuthConfig) {
    this.config = {
      ...config,
      scopes: config.scopes ?? DEFAULT_SCOPES,
    };
  }

  /**
   * Validate the Twitter handle format.
   * Handles may be provided with or without @.
   */
  validateClaimValue(value: string): string | null {
    if (!value || typeof value !== 'string') {
      return 'Twitter handle is required';
    }

    // Remove @ prefix if present
    const handle = value.trim().replace(/^@/, '');

    // Twitter handles: 1-15 chars, alphanumeric + underscore
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) {
      return 'Invalid Twitter handle. Must be 1-15 characters, alphanumeric or underscore.';
    }

    return null;
  }

  /**
   * Normalize Twitter handle: lowercase, no @ prefix.
   */
  normalizeClaimValue(value: string): string {
    return value.trim().replace(/^@/, '').toLowerCase();
  }

  /**
   * Generate an OAuth 2.0 PKCE challenge.
   * Returns an authorization URL that the user must visit.
   */
  async generateChallenge(params: {
    claimId: string;
    agentId: string;
    genome: string;
    claimValue: string;
    nonce: string;
  }): Promise<TwitterChallenge> {
    const { claimId, agentId, genome, claimValue, nonce } = params;
    const normalizedHandle = this.normalizeClaimValue(claimValue);

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Generate OAuth state bound to our nonce + genome
    const oauthState = createHash('sha256')
      .update(`blockgenomics:twitter:${genome}:${nonce}:${claimId}`)
      .digest('hex')
      .slice(0, 32);

    // Build authorization URL
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      scope: this.config.scopes!.join(' '),
      state: oauthState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizationUrl = `${TWITTER_AUTH_URL}?${authParams.toString()}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    return {
      claimId,
      claimType: ClaimType.TWITTER,
      claimValue: normalizedHandle,
      agentId,
      genome,
      nonce,
      issuedAt: now,
      expiresAt,
      instructions: [
        `To verify ownership of @${normalizedHandle}:`,
        `1. Click the authorization link below`,
        `2. Log in to your X/Twitter account (@${normalizedHandle})`,
        `3. Authorize "Block Genomics" (read-only access)`,
        `4. You'll be redirected back — verification completes automatically`,
        ``,
        `Authorization link: ${authorizationUrl}`,
      ].join('\n'),
      oauthState,
      codeVerifier,
      authorizationUrl,
    };
  }

  /**
   * Verify the OAuth callback proof.
   * Exchanges the authorization code for a token, then checks the username.
   */
  async verifyProof(
    challenge: TwitterChallenge,
    proof: TwitterProof,
  ): Promise<VerificationResult> {
    // Validate proof type
    if (proof.proofType !== 'oauth_token') {
      return {
        success: false,
        error: 'Invalid proof type. Expected "oauth_token".',
        errorCode: VerificationErrorCode.INVALID_PROOF_TYPE,
      };
    }

    // Validate nonce
    if (proof.nonce !== challenge.nonce) {
      return {
        success: false,
        error: 'Nonce mismatch.',
        errorCode: VerificationErrorCode.NONCE_MISMATCH,
      };
    }

    // Validate state (prevents CSRF)
    if (proof.state !== challenge.oauthState) {
      return {
        success: false,
        error: 'OAuth state mismatch. Possible CSRF attack.',
        errorCode: VerificationErrorCode.OAUTH_ERROR,
      };
    }

    // Check expiration
    if (new Date() > challenge.expiresAt) {
      return {
        success: false,
        error: 'OAuth flow expired. Please start over.',
        errorCode: VerificationErrorCode.CHALLENGE_EXPIRED,
      };
    }

    try {
      // Exchange authorization code for access token
      const tokenResponse = await this.exchangeCode(
        proof.authorizationCode,
        proof.codeVerifier,
      );

      if (!tokenResponse.access_token) {
        return {
          success: false,
          error: 'Failed to obtain access token from Twitter.',
          errorCode: VerificationErrorCode.OAUTH_ERROR,
        };
      }

      // Fetch authenticated user profile
      const userProfile = await this.fetchUserProfile(tokenResponse.access_token);

      if (!userProfile || !userProfile.data) {
        return {
          success: false,
          error: 'Failed to fetch Twitter profile.',
          errorCode: VerificationErrorCode.EXTERNAL_SERVICE_ERROR,
        };
      }

      // Compare username (case-insensitive)
      const authenticatedUsername = userProfile.data.username.toLowerCase();
      const claimedUsername = challenge.claimValue.toLowerCase();

      if (authenticatedUsername !== claimedUsername) {
        return {
          success: false,
          error: `Authenticated as @${userProfile.data.username} but claimed @${challenge.claimValue}. Please log in with the correct account.`,
          errorCode: VerificationErrorCode.PROOF_MISMATCH,
        };
      }

      // Hash the access token (never store raw tokens)
      const tokenHash = createHash('sha256')
        .update(tokenResponse.access_token)
        .digest('hex');

      return {
        success: true,
        metadata: {
          twitterId: userProfile.data.id,
          username: userProfile.data.username,
          name: userProfile.data.name,
          profileImageUrl: userProfile.data.profile_image_url,
          verified: userProfile.data.verified,
          followersCount: userProfile.data.public_metrics?.followers_count,
          followingCount: userProfile.data.public_metrics?.following_count,
          tweetCount: userProfile.data.public_metrics?.tweet_count,
          accountCreatedAt: userProfile.data.created_at,
        },
        proofData: {
          tokenHash,
          twitterId: userProfile.data.id,
          username: userProfile.data.username,
          verifiedAt: new Date().toISOString(),
          challengeNonce: challenge.nonce,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Twitter API error';
      return {
        success: false,
        error: `Twitter verification failed: ${message}`,
        errorCode: VerificationErrorCode.EXTERNAL_SERVICE_ERROR,
      };
    }
  }

  /**
   * Re-check an active Twitter claim.
   * Verifies the account still exists and handle hasn't changed.
   * Uses app-only auth (Bearer token) — no user interaction needed.
   */
  async recheckClaim(claim: VerifiedClaim): Promise<RecheckResult> {
    try {
      const username = claim.claimValue;

      // Use app-only auth to check if the user still exists
      const appToken = await this.getAppOnlyToken();
      const response = await fetch(
        `${TWITTER_USER_BY_USERNAME_URL}/${username}?user.fields=public_metrics,verified,created_at`,
        {
          headers: { Authorization: `Bearer ${appToken}` },
        },
      );

      if (response.status === 404) {
        return { valid: false, reason: `Twitter account @${username} no longer exists` };
      }

      if (response.status === 403) {
        return { valid: false, reason: `Twitter account @${username} is suspended` };
      }

      if (!response.ok) {
        // Don't invalidate on transient API errors
        return { valid: true };
      }

      const data = await response.json() as { data?: TwitterUserResponse };

      if (!data.data) {
        return { valid: false, reason: `Twitter account @${username} not found` };
      }

      // Check that the Twitter ID matches (handle could have been recycled)
      const storedTwitterId = (claim.metadata as Record<string, unknown>)?.twitterId;
      if (storedTwitterId && data.data.id !== storedTwitterId) {
        return {
          valid: false,
          reason: `Handle @${username} now belongs to a different account (ID changed)`,
        };
      }

      return {
        valid: true,
        updatedMetadata: {
          followersCount: data.data.public_metrics?.followers_count,
          followingCount: data.data.public_metrics?.following_count,
          tweetCount: data.data.public_metrics?.tweet_count,
          lastCheckedAt: new Date().toISOString(),
        },
      };
    } catch {
      // Transient errors: don't invalidate
      return { valid: true };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Generate a PKCE code verifier (43-128 chars, URL-safe random).
   */
  private generateCodeVerifier(): string {
    return randomBytes(32)
      .toString('base64url')
      .slice(0, 128);
  }

  /**
   * Generate PKCE code challenge from verifier (S256 method).
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  /**
   * Exchange authorization code for access token.
   */
  private async exchangeCode(
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<TwitterTokenResponse> {
    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code: authorizationCode,
        grant_type: 'authorization_code',
        redirect_uri: this.config.callbackUrl,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<TwitterTokenResponse>;
  }

  /**
   * Fetch the authenticated user's profile.
   */
  private async fetchUserProfile(accessToken: string): Promise<{ data: TwitterUserResponse }> {
    const response = await fetch(
      `${TWITTER_USER_URL}?user.fields=id,username,name,profile_image_url,verified,public_metrics,created_at`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Profile fetch failed (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<{ data: TwitterUserResponse }>;
  }

  /**
   * Get an app-only bearer token for re-verification checks.
   * Uses OAuth 2.0 Client Credentials flow.
   */
  private async getAppOnlyToken(): Promise<string> {
    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`App-only token request failed (${response.status})`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }
}

// =============================================================================
// TWITTER API TYPES
// =============================================================================

interface TwitterTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token?: string;
}

interface TwitterUserResponse {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  verified?: boolean;
  created_at?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}
