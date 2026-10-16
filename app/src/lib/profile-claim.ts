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
