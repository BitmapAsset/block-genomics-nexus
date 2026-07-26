/**
 * Sandbox tier constants and pure helpers.
 *
 * This module is deliberately dependency-free (no `crypto`, no Prisma) so it can
 * be imported by BOTH the Node API routes and the Edge middleware. The middleware
 * is what enforces read-only globally, and Edge cannot bundle Node built-ins —
 * hence the split from `sandbox-keys.ts`.
 */

/** Plaintext key prefix. Distinct from `bg_agent_` so the tier is obvious on sight. */
export const SANDBOX_KEY_PREFIX = 'bg_sbx_';

/** Requests per sandbox key per UTC day. */
export const SANDBOX_DAILY_LIMIT = 100;

/** Sandbox keys a single source IP may mint per UTC day. */
export const SANDBOX_ISSUE_PER_IP_PER_DAY = 3;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** HTTP methods a sandbox key is allowed to use. Everything else is a write. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

/** Extract a token from an `Authorization: Bearer <token>` header. */
export function bearerFrom(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Shape-only check — says nothing about whether the key is valid or live. */
export function looksLikeSandboxKey(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(SANDBOX_KEY_PREFIX);
}

/**
 * Read a sandbox credential off a request. Accepts `Authorization: Bearer <key>`
 * or the `X-API-Key` header (SDK clients commonly use the latter).
 */
export function sandboxKeyFromHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  const bearer = bearerFrom(headers.get('authorization'));
  if (looksLikeSandboxKey(bearer)) return bearer;
  const apiKey = headers.get('x-api-key')?.trim();
  if (looksLikeSandboxKey(apiKey)) return apiKey as string;
  return null;
}

export const SANDBOX_UPGRADE_URL = 'https://blockgenomics.io/docs';

/** The body returned when a sandbox key attempts a write. */
export function sandboxWriteBlockedBody(method: string, path: string) {
  return {
    success: false as const,
    error:
      `Sandbox keys are read-only — ${method.toUpperCase()} ${path} requires a verified key. ` +
      'Writes are gated behind Bitmap ownership: request a challenge from POST /api/v1/challenge, ' +
      'sign it with the wallet holding your Bitmap block, and verify via POST /api/v1/auth/verify.',
    code: 'sandbox_read_only' as const,
    upgrade: {
      reason: 'write_requires_ownership',
      steps: [
        'POST /api/v1/challenge — request a signing challenge',
        'Sign the challenge with the Bitcoin wallet that owns your Bitmap block (BIP-322)',
        'POST /api/v1/auth/verify — exchange the signature for verified-tier access',
      ],
      docs: SANDBOX_UPGRADE_URL,
    },
  };
}
