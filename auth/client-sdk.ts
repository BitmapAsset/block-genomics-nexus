/**
 * Block Genomics Auth — Client SDK
 *
 * The official client library for integrating BG Auth into any application.
 * Handles all auth flows (browser, API, widget) with a simple, unified API.
 *
 * @example Browser app:
 * ```ts
 * import { BGAuth } from '@blockgenomics/auth';
 *
 * const bg = BGAuth.init('client_abc123', {
 *   authServerUrl: 'https://auth.blockgenomics.io',
 * });
 *
 * // Sign in (opens popup/redirect)
 * const identity = await bg.signIn(['identity', 'trust_score']);
 * console.log(identity.genomeId, identity.trustScore);
 *
 * // Later: verify the stored token
 * const verified = await bg.verify(identity.accessToken);
 *
 * // Sign out
 * await bg.signOut();
 * ```
 *
 * @example AI agent (server-to-server):
 * ```ts
 * import { BGAuth } from '@blockgenomics/auth';
 *
 * const bg = BGAuth.init('client_abc123', {
 *   clientSecret: 'bgs_secret...',
 *   authServerUrl: 'https://auth.blockgenomics.io',
 * });
 *
 * const identity = await bg.signInWithChallenge(
 *   'bg_7a3fc912a1b4e8d0',
 *   (message) => myWallet.signBIP322(message),
 *   ['identity', 'trust_score'],
 * );
 * ```
 *
 * @module client-sdk
 */

import type { BGScope, Tier, TrustDetails, BlockClaim, DelegationLink } from './token-spec';
import {
  initiateAuth,
  handleCallback,
  handlePopupCallback,
  validateToken as browserValidate,
  type BGIdentity as BrowserIdentity,
} from './flows/browser-flow';
import {
  authenticate,
  verifyToken as apiVerify,
  refreshAccessToken,
  revokeToken,
  type BGAuthTokens,
  type BGAgentIdentity,
} from './flows/api-flow';

// ============================================================
// Types
// ============================================================

/** Client SDK initialization options */
export interface BGAuthOptions {
  /** BG Auth server URL (default: https://auth.blockgenomics.io) */
  authServerUrl?: string;
  /** Client secret (required for server-to-server flows, never use in browser) */
  clientSecret?: string;
  /** Redirect URI for browser flow callback */
  redirectUri?: string;
  /** Whether to use popup (true) or redirect (false) for browser flow */
  usePopup?: boolean;
  /** Auto-refresh tokens before they expire */
  autoRefresh?: boolean;
  /** Seconds before expiry to trigger auto-refresh (default: 300 = 5 min) */
  autoRefreshBuffer?: number;
  /** Storage adapter for persisting tokens (default: in-memory) */
  storage?: BGAuthStorage;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/** Storage adapter interface for token persistence */
export interface BGAuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Unified identity object returned by all auth methods */
export interface BGIdentity {
  /** Genome ID (short form, e.g., "bg_7a3fc912a1b4e8d0") */
  genomeId: string;
  /** Full genome hash (if genome_data scope was granted) */
  genomeHash?: string;
  /** Bitcoin block height */
  blockHeight?: number;
  /** Bitcoin block hash */
  blockHash?: string;
  /** Verification tier (1=owner, 2=TX anchor, 3=delegated) */
  tier: Tier;
  /** Trust score (0-100) */
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
  /** Whether the identity is currently valid (token not expired) */
  isValid: boolean;
  /** The raw access token */
  accessToken: string;
  /** Whether we have a refresh token for this session */
  canRefresh: boolean;
}

/** Auth state change event */
export type BGAuthEvent =
  | { type: 'signed_in'; identity: BGIdentity }
  | { type: 'signed_out' }
  | { type: 'token_refreshed'; identity: BGIdentity }
  | { type: 'error'; error: Error };

/** Auth state change listener */
export type BGAuthListener = (event: BGAuthEvent) => void;

// ============================================================
// Storage Keys
// ============================================================

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bg_access_token',
  REFRESH_TOKEN: 'bg_refresh_token',
  IDENTITY: 'bg_identity',
} as const;

// ============================================================
// Client SDK Implementation
// ============================================================

/**
 * Block Genomics Auth Client.
 *
 * Provides a unified API for all authentication flows.
 * Manages token lifecycle, auto-refresh, and session persistence.
 */
export class BGAuthClient {
  private clientId: string;
  private options: Required<
    Pick<BGAuthOptions, 'authServerUrl' | 'usePopup' | 'autoRefresh' | 'autoRefreshBuffer' | 'timeoutMs'>
  > & BGAuthOptions;
  private storage: BGAuthStorage;
  private listeners: Set<BGAuthListener> = new Set();
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private currentIdentity: BGIdentity | null = null;
  private refreshToken: string | null = null;

  constructor(clientId: string, options: BGAuthOptions = {}) {
    this.clientId = clientId;
    this.options = {
      authServerUrl: options.authServerUrl ?? 'https://auth.blockgenomics.io',
      usePopup: options.usePopup ?? true,
      autoRefresh: options.autoRefresh ?? true,
      autoRefreshBuffer: options.autoRefreshBuffer ?? 300,
      timeoutMs: options.timeoutMs ?? 30_000,
      ...options,
    };
    this.storage = options.storage ?? createInMemoryStorage();
  }

  // ---- Public API ----

  /**
   * Sign in via the browser flow (popup or redirect).
   *
   * For human users with a Bitcoin wallet extension.
   *
   * @param scopes - Requested scopes
   * @returns The authenticated identity
   */
  async signIn(scopes: BGScope[] = ['identity', 'trust_score']): Promise<BGIdentity> {
    const redirectUri =
      this.options.redirectUri ??
      (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '');

    if (this.options.usePopup) {
      return this.signInWithPopup(scopes, redirectUri);
    } else {
      return this.signInWithRedirect(scopes, redirectUri);
    }
  }

  /**
   * Sign in via the API flow (challenge-response).
   *
   * For AI agents and server-to-server authentication.
   *
   * @param genomeId - The agent's genome ID
   * @param signFn - Function that signs a message with BIP-322
   * @param scopes - Requested scopes
   * @returns The authenticated identity
   */
  async signInWithChallenge(
    genomeId: string,
    signFn: (message: string) => Promise<string>,
    scopes: BGScope[] = ['identity', 'trust_score'],
  ): Promise<BGIdentity> {
    if (!this.options.clientSecret) {
      throw new BGClientError(
        'missing_secret',
        'clientSecret is required for challenge-response auth',
      );
    }

    const tokens = await authenticate(genomeId, signFn, {
      clientId: this.clientId,
      clientSecret: this.options.clientSecret,
      authServerUrl: this.options.authServerUrl,
      timeoutMs: this.options.timeoutMs,
    }, { scopes });

    const identity = await this.processTokens(tokens);
    return identity;
  }

  /**
   * Verify an existing token and extract the identity.
   *
   * @param token - The access token to verify
   * @returns The decoded identity
   */
  async verify(token: string): Promise<BGIdentity> {
    const serverMode = !!this.options.clientSecret;

    if (serverMode) {
      const agentIdentity = await apiVerify(token, {
        mode: 'server',
        config: {
          clientId: this.clientId,
          clientSecret: this.options.clientSecret!,
          authServerUrl: this.options.authServerUrl,
        },
      });

      return this.agentIdentityToBGIdentity(agentIdentity, token);
    }

    const browserIdentity = await browserValidate(token, {
      authServerUrl: this.options.authServerUrl,
      audience: this.clientId,
    });

    return this.browserIdentityToBGIdentity(browserIdentity);
  }

  /**
   * Sign out and revoke tokens.
   */
  async signOut(): Promise<void> {
    // Revoke refresh token if possible
    if (this.refreshToken && this.options.clientSecret) {
      try {
        await revokeToken(this.refreshToken, {
          clientId: this.clientId,
          clientSecret: this.options.clientSecret,
          authServerUrl: this.options.authServerUrl,
        });
      } catch {
        // Best effort — continue with local cleanup
      }
    }

    // Clear state
    this.currentIdentity = null;
    this.refreshToken = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    // Clear storage
    await this.storage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    await this.storage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    await this.storage.removeItem(STORAGE_KEYS.IDENTITY);

    this.emit({ type: 'signed_out' });
  }

  /**
   * Get the current identity (if signed in).
   * Returns null if not signed in or token is expired.
   */
  getIdentity(): BGIdentity | null {
    if (!this.currentIdentity) return null;
    const now = Math.floor(Date.now() / 1000);
    return {
      ...this.currentIdentity,
      isValid: this.currentIdentity.expiresAt > now,
    };
  }

  /**
   * Check if the user is currently signed in with a valid token.
   */
  isSignedIn(): boolean {
    const identity = this.getIdentity();
    return identity !== null && identity.isValid;
  }

  /**
   * Manually refresh the access token.
   *
   * @returns The refreshed identity
   */
  async refresh(): Promise<BGIdentity> {
    if (!this.refreshToken) {
      throw new BGClientError('no_refresh_token', 'No refresh token available');
    }
    if (!this.options.clientSecret) {
      throw new BGClientError('missing_secret', 'clientSecret is required for token refresh');
    }

    const tokens = await refreshAccessToken(this.refreshToken, {
      clientId: this.clientId,
      clientSecret: this.options.clientSecret,
      authServerUrl: this.options.authServerUrl,
    });

    const identity = await this.processTokens(tokens);
    this.emit({ type: 'token_refreshed', identity });
    return identity;
  }

  /**
   * Subscribe to auth state changes.
   *
   * @param listener - Callback for auth events
   * @returns Unsubscribe function
   */
  onAuthStateChange(listener: BGAuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Restore session from storage (call on app init).
   *
   * @returns The restored identity, or null if no valid session
   */
  async restoreSession(): Promise<BGIdentity | null> {
    const tokenStr = await this.storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshStr = await this.storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (refreshStr) this.refreshToken = refreshStr;

    if (tokenStr) {
      try {
        const identity = await this.verify(tokenStr);
        if (identity.isValid) {
          this.currentIdentity = identity;
          this.scheduleAutoRefresh(identity);
          return identity;
        }
      } catch {
        // Token invalid — try refresh
      }
    }

    // Try refreshing
    if (this.refreshToken && this.options.clientSecret) {
      try {
        return await this.refresh();
      } catch {
        // Refresh failed — session is gone
      }
    }

    return null;
  }

  // ---- Private Methods ----

  private async signInWithPopup(
    scopes: BGScope[],
    redirectUri: string,
  ): Promise<BGIdentity> {
    const { popupResult } = await initiateAuth(this.clientId, scopes, redirectUri, {
      authServerUrl: this.options.authServerUrl,
      usePopup: true,
    });

    if (!popupResult) {
      throw new BGClientError('popup_failed', 'Failed to open auth popup');
    }

    const { code } = await popupResult;

    const browserIdentity = await handlePopupCallback(code, {
      clientId: this.clientId,
      clientSecret: this.options.clientSecret,
      authServerUrl: this.options.authServerUrl,
    });

    const identity = this.browserIdentityToBGIdentity(browserIdentity);
    await this.saveSession(identity, browserIdentity.refreshToken);
    this.emit({ type: 'signed_in', identity });
    return identity;
  }

  private async signInWithRedirect(
    scopes: BGScope[],
    redirectUri: string,
  ): Promise<BGIdentity> {
    // Check if we're on the callback URL
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      const browserIdentity = await handleCallback(window.location.href, {
        clientId: this.clientId,
        clientSecret: this.options.clientSecret,
        authServerUrl: this.options.authServerUrl,
      });

      const identity = this.browserIdentityToBGIdentity(browserIdentity);
      await this.saveSession(identity, browserIdentity.refreshToken);

      // Clean up URL
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      this.emit({ type: 'signed_in', identity });
      return identity;
    }

    // Initiate redirect
    const { authUrl } = await initiateAuth(this.clientId, scopes, redirectUri, {
      authServerUrl: this.options.authServerUrl,
    });

    window.location.href = authUrl;

    // This will never resolve (page navigates away)
    return new Promise(() => {});
  }

  private async processTokens(tokens: BGAuthTokens): Promise<BGIdentity> {
    const agentIdentity = await apiVerify(tokens.accessToken, { mode: 'local' });

    const identity: BGIdentity = {
      genomeId: tokens.genomeId,
      genomeHash: agentIdentity.genomeHash,
      blockHeight: agentIdentity.blockHeight,
      blockHash: agentIdentity.blockHash,
      tier: tokens.tier,
      trustScore: tokens.trustScore,
      trustDetails: agentIdentity.trustDetails,
      claims: agentIdentity.claims,
      delegationChain: agentIdentity.delegationChain,
      scopes: agentIdentity.scopes,
      expiresAt: agentIdentity.expiresAt,
      isValid: true,
      accessToken: tokens.accessToken,
      canRefresh: !!tokens.refreshToken,
    };

    await this.saveSession(identity, tokens.refreshToken);
    this.emit({ type: 'signed_in', identity });
    return identity;
  }

  private async saveSession(identity: BGIdentity, refreshToken?: string): Promise<void> {
    this.currentIdentity = identity;
    this.refreshToken = refreshToken ?? null;

    await this.storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, identity.accessToken);
    if (refreshToken) {
      await this.storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    }
    await this.storage.setItem(STORAGE_KEYS.IDENTITY, JSON.stringify({
      genomeId: identity.genomeId,
      tier: identity.tier,
      trustScore: identity.trustScore,
      scopes: identity.scopes,
    }));

    this.scheduleAutoRefresh(identity);
  }

  private scheduleAutoRefresh(identity: BGIdentity): void {
    if (!this.options.autoRefresh || !this.refreshToken || !this.options.clientSecret) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);

    const now = Math.floor(Date.now() / 1000);
    const refreshAt = identity.expiresAt - this.options.autoRefreshBuffer;
    const delayMs = Math.max((refreshAt - now) * 1000, 1000);

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (error) {
        this.emit({
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }, delayMs);
  }

  private browserIdentityToBGIdentity(bi: BrowserIdentity): BGIdentity {
    const now = Math.floor(Date.now() / 1000);
    return {
      genomeId: bi.genomeId,
      genomeHash: bi.genomeHash,
      blockHeight: bi.blockHeight,
      blockHash: bi.blockHash,
      tier: bi.tier,
      trustScore: bi.trustScore,
      trustDetails: bi.trustDetails,
      claims: bi.claims,
      delegationChain: bi.delegationChain,
      scopes: bi.scopes,
      expiresAt: bi.expiresAt,
      isValid: bi.expiresAt > now,
      accessToken: bi.accessToken,
      canRefresh: !!bi.refreshToken,
    };
  }

  private agentIdentityToBGIdentity(ai: BGAgentIdentity, token: string): BGIdentity {
    return {
      genomeId: ai.genomeId,
      genomeHash: ai.genomeHash,
      blockHeight: ai.blockHeight,
      blockHash: ai.blockHash,
      tier: ai.tier,
      trustScore: ai.trustScore,
      trustDetails: ai.trustDetails,
      claims: ai.claims,
      delegationChain: ai.delegationChain,
      scopes: ai.scopes,
      expiresAt: ai.expiresAt,
      isValid: ai.active,
      accessToken: token,
      canRefresh: !!this.refreshToken,
    };
  }

  private emit(event: BGAuthEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[BGAuth] Listener error:', e);
      }
    }
  }
}

// ============================================================
// Static Factory
// ============================================================

/**
 * BGAuth — Static entry point for the client SDK.
 *
 * @example
 * ```ts
 * const bg = BGAuth.init('client_abc123');
 * const identity = await bg.signIn();
 * ```
 */
export const BGAuth = {
  /**
   * Initialize a BGAuth client.
   *
   * @param clientId - Your registered client ID
   * @param options - Configuration options
   * @returns A BGAuthClient instance
   */
  init(clientId: string, options?: BGAuthOptions): BGAuthClient {
    return new BGAuthClient(clientId, options);
  },

  /**
   * Shorthand: sign in (creates a temporary client).
   */
  async signIn(
    clientId: string,
    scopes?: BGScope[],
    options?: BGAuthOptions,
  ): Promise<BGIdentity> {
    const client = new BGAuthClient(clientId, options);
    return client.signIn(scopes);
  },

  /**
   * Shorthand: verify a token (creates a temporary client).
   */
  async verify(
    token: string,
    clientId: string,
    options?: BGAuthOptions,
  ): Promise<BGIdentity> {
    const client = new BGAuthClient(clientId, options);
    return client.verify(token);
  },

  /**
   * Shorthand: sign out (clears all state).
   */
  async signOut(clientId: string, options?: BGAuthOptions): Promise<void> {
    const client = new BGAuthClient(clientId, options);
    return client.signOut();
  },
};

// ============================================================
// Helpers
// ============================================================

/** Create an in-memory storage adapter (for server-side or ephemeral use) */
function createInMemoryStorage(): BGAuthStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  };
}

/** Error from the BGAuth client SDK */
export class BGClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BGClientError';
  }
}

// ============================================================
// Exports
// ============================================================

export default BGAuth;
