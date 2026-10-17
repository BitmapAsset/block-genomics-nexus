/**
 * The signed request behind "Claim a handle" on a verified bitmap.
 *
 * POST /api/v1/profiles/create authorizes only a message that binds this exact
 * action, path, block and body (lib/action-message), with a nonce issued by
 * POST /api/v1/challenge for purpose "profile". This builds that request on
 * the client so the wallet signs the same bytes the server reconstructs.
 */

import { buildActionMessage, hashBody } from '@/lib/action-message';
import { HANDLE_ERROR, isValidHandle, normalizeHandle } from '@/lib/handle';

export const PROFILE_CREATE_PATH = '/api/v1/profiles/create';
export const PROFILE_CHALLENGE_PURPOSE = 'profile';
/** How long the signed authorization stays valid. */
const AUTH_TTL_MS = 5 * 60 * 1000;

export interface ProfileClaimInput {
  walletAddress: string;
  blockHeight: number;
  handle: string;
  displayName?: string;
}

/** Normalized handle, or the shared error message. */
export function checkHandle(raw: string): { ok: true; handle: string } | { ok: false; error: string } {
  const handle = normalizeHandle(raw.replace(/^@/, ''));
  return isValidHandle(handle) ? { ok: true, handle } : { ok: false, error: HANDLE_ERROR };
}

export interface ClaimFailure {
  /** The wallet has no verified account: the way forward is verifying the bitmap. */
  needsVerify: boolean;
  message: string;
}

/**
 * One sentence for a failed claim, never an API path. The route answers 403
 * "Wallet must be verified first via /auth/verify" when the wallet has no
 * verified `User`; the page turns that into "verify this bitmap first".
 */
export function describeClaimFailure(httpStatus: number, error: unknown): ClaimFailure {
  const text = typeof error === 'string' ? error.trim() : '';
  if (httpStatus === 403 && /verified first/i.test(text)) {
    return {
      needsVerify: true,
      message: 'Verify this bitmap first: one signature proves your wallet holds it, then you can claim a handle. Nothing was created.',
    };
  }
  if (httpStatus === 503) {
    return {
      needsVerify: false,
      message: "Your signature is fine, but the chain couldn't confirm the holder right now. Nothing was created. Try again in a moment.",
    };
  }
  // Server sentences that name a route ("… via /auth/verify") lose the route.
  const plain = text.replace(/\s*\bvia\s+\/\S+/gi, '').replace(/\s*\/(?:api|auth)\/\S*/gi, '').replace(/[.\s]+$/, '');
  return { needsVerify: false, message: `${plain || `The claim failed (HTTP ${httpStatus})`}. Nothing was created.` };
}

/** Body + canonical message to sign. `nonce` comes from /api/v1/challenge. */
export async function buildProfileClaim(
  input: ProfileClaimInput,
  nonce: string,
  now: number = Date.now(),
): Promise<{ body: Record<string, unknown>; message: string }> {
  const body: Record<string, unknown> = {
    walletAddress: input.walletAddress,
    blockHeight: input.blockHeight,
    handle: input.handle,
    ...(input.displayName ? { displayName: input.displayName } : {}),
  };
  const message = buildActionMessage({
    action: 'profile.create',
    method: 'POST',
    path: PROFILE_CREATE_PATH,
    blockHeight: input.blockHeight,
    bodyHash: await hashBody(body),
    nonce,
    expiresAt: now + AUTH_TTL_MS,
  });
  return { body, message };
}
