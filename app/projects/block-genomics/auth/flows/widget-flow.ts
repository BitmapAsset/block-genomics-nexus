/**
 * Block Genomics Auth — Widget Flow
 *
 * Drop-in "Sign in with Block Genomics" button that any website can embed.
 * Renders a customizable button, handles the popup auth flow, and fires
 * a callback on successful authentication.
 *
 * Usage:
 *   HTML:  <bg-signin client-id="..." scopes="identity trust_score" />
 *   JS:    BGSignIn.render('#container', { clientId: '...', onSuccess: fn })
 *
 * @module widget-flow
 */

import type { BGScope, Tier } from '../token-spec';

// ============================================================
// Widget Configuration
// ============================================================

/** Configuration for the Sign In widget */
export interface BGWidgetConfig {
  /** Your registered client ID */
  clientId: string;
  /** Requested scopes (default: ['identity', 'trust_score']) */
  scopes?: BGScope[];
  /** Redirect URI for the auth callback */
  redirectUri?: string;
  /** BG Auth server URL */
  authServerUrl?: string;
  /** Callback when auth succeeds */
  onSuccess?: (result: BGWidgetAuthResult) => void;
  /** Callback when auth fails */
  onError?: (error: BGWidgetError) => void;
  /** Button theme */
  theme?: 'dark' | 'light' | 'auto';
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Button shape */
  shape?: 'rectangular' | 'pill';
  /** Button text */
  text?: 'sign-in' | 'continue' | 'verify';
  /** Whether to show the genome icon */
  showIcon?: boolean;
  /** Custom CSS class to add to the button */
  className?: string;
  /** Popup dimensions */
  popupWidth?: number;
  popupHeight?: number;
  /** Minimum trust score to accept */
  minTrustScore?: number;
  /** Minimum tier to accept */
  minTier?: Tier;
}

/** Result from a successful widget authentication */
export interface BGWidgetAuthResult {
  /** Authorization code (exchange server-side for tokens) */
  code: string;
  /** State parameter for CSRF verification */
  state: string;
  /** Genome ID of the authenticated agent */
  genomeId: string;
  /** Trust score */
  trustScore: number;
  /** Verification tier */
  tier: Tier;
}

/** Error from widget authentication */
export class BGWidgetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BGWidgetError';
  }
}

// ============================================================
// Default Styles
// ============================================================

const BUTTON_STYLES = {
  dark: {
    bg: '#0c0c14',
    bgHover: '#1a1a24',
    border: '#f7931a',
    text: '#ffffff',
    subtext: '#94a3b8',
    icon: '#f7931a',
  },
  light: {
    bg: '#ffffff',
    bgHover: '#f8f9fa',
    border: '#e2e8f0',
    text: '#1a1a2e',
    subtext: '#64748b',
    icon: '#f7931a',
  },
} as const;

const SIZE_STYLES = {
  small:  { height: 36, fontSize: 13, iconSize: 16, padding: '0 12px' },
  medium: { height: 44, fontSize: 15, iconSize: 20, padding: '0 16px' },
  large:  { height: 52, fontSize: 17, iconSize: 24, padding: '0 24px' },
} as const;

const BUTTON_TEXT = {
  'sign-in':  'Sign in with Block Genomics',
  'continue': 'Continue with Block Genomics',
  'verify':   'Verify with Block Genomics',
} as const;

/** The BG genome icon as an inline SVG */
const GENOME_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.1"/>
  <text x="12" y="16" text-anchor="middle" font-size="14" fill="currentColor">🧬</text>
</svg>`;

// ============================================================
// Widget Renderer (Vanilla JS)
// ============================================================

/**
 * Render the "Sign in with Block Genomics" button.
 *
 * Can be called programmatically or auto-invoked by the <bg-signin> custom element.
 *
 * @param container - CSS selector or DOM element to render into
 * @param config - Widget configuration
 * @returns Object with cleanup/destroy function
 *
 * @example
 * ```ts
 * BGSignIn.render('#signin-container', {
 *   clientId: 'client_abc123',
 *   scopes: ['identity', 'trust_score'],
 *   onSuccess: (result) => {
 *     console.log('Authenticated!', result.genomeId);
 *     // Exchange result.code for tokens server-side
 *   },
 *   onError: (error) => {
 *     console.error('Auth failed:', error.message);
 *   },
 * });
 * ```
 */
export function render(
  container: string | HTMLElement,
  config: BGWidgetConfig,
): { destroy: () => void } {
  const el =
    typeof container === 'string'
      ? document.querySelector<HTMLElement>(container)
      : container;

  if (!el) {
    throw new BGWidgetError('container_not_found', `Container "${container}" not found in DOM`);
  }

  // Resolve theme
  const resolvedTheme = resolveTheme(config.theme ?? 'auto');
  const colors = BUTTON_STYLES[resolvedTheme];
  const sizeStyle = SIZE_STYLES[config.size ?? 'medium'];
  const buttonText = BUTTON_TEXT[config.text ?? 'sign-in'];
  const shape = config.shape ?? 'rectangular';
  const showIcon = config.showIcon !== false;

  // Create button element
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', buttonText);
  if (config.className) button.classList.add(config.className);

  // Apply styles
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: `${sizeStyle.height}px`,
    padding: sizeStyle.padding,
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: shape === 'pill' ? `${sizeStyle.height / 2}px` : '8px',
    fontSize: `${sizeStyle.fontSize}px`,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.15s, transform 0.1s',
    outline: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  } as CSSStyleDeclaration);

  // Hover/active effects
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = colors.bgHover;
  });
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = colors.bg;
  });
  button.addEventListener('mousedown', () => {
    button.style.transform = 'scale(0.98)';
  });
  button.addEventListener('mouseup', () => {
    button.style.transform = 'scale(1)';
  });

  // Build inner content
  if (showIcon) {
    const iconSpan = document.createElement('span');
    iconSpan.style.display = 'inline-flex';
    iconSpan.style.width = `${sizeStyle.iconSize}px`;
    iconSpan.style.height = `${sizeStyle.iconSize}px`;
    iconSpan.style.color = colors.icon;
    iconSpan.innerHTML = GENOME_ICON;
    button.appendChild(iconSpan);
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = buttonText;
  button.appendChild(textSpan);

  // Click handler — open popup auth flow
  const handleClick = () => {
    openAuthPopup(config);
  };

  button.addEventListener('click', handleClick);

  // Mount
  el.appendChild(button);

  // Cleanup function
  const destroy = () => {
    button.removeEventListener('click', handleClick);
    el.removeChild(button);
  };

  return { destroy };
}

// ============================================================
// Auth Popup Handler
// ============================================================

/** Open the auth popup and listen for the result */
function openAuthPopup(config: BGWidgetConfig): void {
  const authServer = config.authServerUrl ?? 'https://auth.blockgenomics.io';
  const scopes = config.scopes ?? ['identity', 'trust_score'];
  const redirectUri = config.redirectUri ?? `${authServer}/widget/callback`;

  // Generate PKCE and state
  const state = randomString(32);
  const codeVerifier = randomString(64);

  // We compute code_challenge async and then open the popup
  computeCodeChallenge(codeVerifier).then((codeChallenge) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      widget: 'true', // Tells auth server to use postMessage callback
    });

    if (config.minTrustScore) params.set('min_trust_score', String(config.minTrustScore));
    if (config.minTier) params.set('min_tier', String(config.minTier));

    const width = config.popupWidth ?? 480;
    const height = config.popupHeight ?? 640;
    const left = Math.round((screen.width - width) / 2);
    const top = Math.round((screen.height - height) / 2);

    const popup = window.open(
      `${authServer}/authorize?${params.toString()}`,
      'bg_signin_popup',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    if (!popup) {
      config.onError?.(
        new BGWidgetError('popup_blocked', 'Browser blocked the auth popup. Please allow popups.'),
      );
      return;
    }

    // Listen for postMessage from the popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== authServer) return;
      if (event.data?.type !== 'bg_auth_callback') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(popupCheck);

      if (event.data.error) {
        config.onError?.(
          new BGWidgetError(
            event.data.error,
            event.data.error_description ?? 'Authentication failed',
          ),
        );
        return;
      }

      // Verify state
      if (event.data.state !== state) {
        config.onError?.(
          new BGWidgetError('state_mismatch', 'Auth state mismatch. Possible CSRF.'),
        );
        return;
      }

      config.onSuccess?.({
        code: event.data.code,
        state: event.data.state,
        genomeId: event.data.genome_id,
        trustScore: event.data.trust_score,
        tier: event.data.tier,
      });
    };

    window.addEventListener('message', handleMessage);

    // Detect if popup is closed without completing auth
    const popupCheck = setInterval(() => {
      if (popup.closed) {
        clearInterval(popupCheck);
        window.removeEventListener('message', handleMessage);
        // Only fire error if no success was already fired
        // (race condition: message arrives just as popup closes)
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(popupCheck);
      window.removeEventListener('message', handleMessage);
      if (!popup.closed) popup.close();
    }, 5 * 60 * 1000);
  });
}

// ============================================================
// Custom Element: <bg-signin>
// ============================================================

/**
 * Web Component for the "Sign in with Block Genomics" button.
 *
 * Usage:
 * ```html
 * <script src="https://auth.blockgenomics.io/widget.js"></script>
 *
 * <bg-signin
 *   client-id="client_abc123"
 *   scopes="identity trust_score"
 *   theme="dark"
 *   size="medium"
 *   on-success="handleBGAuth"
 * ></bg-signin>
 *
 * <script>
 *   function handleBGAuth(result) {
 *     console.log('Genome:', result.genomeId);
 *     console.log('Trust:', result.trustScore);
 *     // Exchange result.code for tokens on your server
 *   }
 * </script>
 * ```
 */
export class BGSignInElement extends HTMLElement {
  private _cleanup?: { destroy: () => void };

  static get observedAttributes() {
    return [
      'client-id', 'scopes', 'redirect-uri', 'auth-server',
      'theme', 'size', 'shape', 'text', 'show-icon',
      'on-success', 'on-error',
      'min-trust-score', 'min-tier',
    ];
  }

  connectedCallback() {
    this.renderButton();
  }

  disconnectedCallback() {
    this._cleanup?.destroy();
  }

  attributeChangedCallback() {
    this._cleanup?.destroy();
    this.renderButton();
  }

  private renderButton() {
    const clientId = this.getAttribute('client-id');
    if (!clientId) {
      console.warn('[bg-signin] Missing required "client-id" attribute');
      return;
    }

    const scopes = (this.getAttribute('scopes') ?? 'identity trust_score')
      .split(/\s+/)
      .filter(Boolean) as BGScope[];

    const onSuccessName = this.getAttribute('on-success');
    const onErrorName = this.getAttribute('on-error');

    const config: BGWidgetConfig = {
      clientId,
      scopes,
      redirectUri: this.getAttribute('redirect-uri') ?? undefined,
      authServerUrl: this.getAttribute('auth-server') ?? undefined,
      theme: (this.getAttribute('theme') as BGWidgetConfig['theme']) ?? 'auto',
      size: (this.getAttribute('size') as BGWidgetConfig['size']) ?? 'medium',
      shape: (this.getAttribute('shape') as BGWidgetConfig['shape']) ?? 'rectangular',
      text: (this.getAttribute('text') as BGWidgetConfig['text']) ?? 'sign-in',
      showIcon: this.getAttribute('show-icon') !== 'false',
      minTrustScore: this.getAttribute('min-trust-score')
        ? Number(this.getAttribute('min-trust-score'))
        : undefined,
      minTier: this.getAttribute('min-tier')
        ? (Number(this.getAttribute('min-tier')) as Tier)
        : undefined,
      onSuccess: onSuccessName
        ? (result) => {
            const fn = (window as any)[onSuccessName];
            if (typeof fn === 'function') fn(result);
            // Also dispatch a custom event
            this.dispatchEvent(
              new CustomEvent('bg-auth-success', { detail: result, bubbles: true }),
            );
          }
        : (result) => {
            this.dispatchEvent(
              new CustomEvent('bg-auth-success', { detail: result, bubbles: true }),
            );
          },
      onError: onErrorName
        ? (error) => {
            const fn = (window as any)[onErrorName];
            if (typeof fn === 'function') fn(error);
            this.dispatchEvent(
              new CustomEvent('bg-auth-error', { detail: error, bubbles: true }),
            );
          }
        : (error) => {
            this.dispatchEvent(
              new CustomEvent('bg-auth-error', { detail: error, bubbles: true }),
            );
          },
    };

    this._cleanup = render(this, config);
  }
}

/**
 * Register the <bg-signin> custom element.
 * Call this once when the widget script loads.
 */
export function registerWidget(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('bg-signin')) {
    customElements.define('bg-signin', BGSignInElement);
  }
}

// ============================================================
// Auto-registration
// ============================================================

// Auto-register when script loads in a browser
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  registerWidget();
}

// ============================================================
// Embeddable Script Entry Point
// ============================================================

/**
 * Generate the embeddable HTML snippet for third-party integration.
 *
 * @param config - Widget configuration
 * @returns HTML string to embed
 */
export function generateEmbedCode(config: {
  clientId: string;
  scopes?: string[];
  theme?: string;
  size?: string;
}): string {
  const scopes = (config.scopes ?? ['identity', 'trust_score']).join(' ');
  const theme = config.theme ?? 'dark';
  const size = config.size ?? 'medium';

  return `<!-- Block Genomics Auth Widget -->
<script src="https://auth.blockgenomics.io/widget.js" async></script>
<bg-signin
  client-id="${config.clientId}"
  scopes="${scopes}"
  theme="${theme}"
  size="${size}"
  on-success="onBGAuth"
></bg-signin>
<script>
  function onBGAuth(result) {
    // result.code     — Exchange for tokens on your server
    // result.genomeId — Agent's genome ID
    // result.trustScore — Trust score (0-100)
    // result.tier     — Verification tier (1/2/3)
    console.log('BG Auth success:', result);
  }
</script>`;
}

// ============================================================
// Utility Functions
// ============================================================

/** Resolve 'auto' theme based on OS preference */
function resolveTheme(theme: 'dark' | 'light' | 'auto'): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Generate a random URL-safe string */
function randomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(36))
    .join('')
    .slice(0, length);
}

/** Compute SHA-256 code challenge from a code verifier */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ============================================================
// Exports
// ============================================================

/** Public API for the widget module */
const BGSignIn = {
  render,
  registerWidget,
  generateEmbedCode,
};

export default BGSignIn;
