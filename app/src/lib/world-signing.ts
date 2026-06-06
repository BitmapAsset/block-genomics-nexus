// Client helper: perform an owner-authorized world/game mutation.
//
// Flow for every state-mutating request:
//   1. Request a fresh one-time nonce from /api/v1/challenge (purpose 'world').
//   2. Hash the request body and build the canonical action-bound message
//      (binds method + exact path + blockHeight + bodyHash + nonce + expiry).
//   3. Sign that message with the connected wallet (BIP-322).
//   4. Send the request with { ...body, signature, message }.
//
// The server reconstructs the binding from the actual request and atomically
// consumes the nonce, so a captured request can be neither replayed nor
// re-pointed at a different endpoint.

import { buildActionMessage, hashBody } from './action-message';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface SignedMutationOptions {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string; // exact route path incl. id, e.g. '/api/v1/world/abc'
  action: string; // semantic label, e.g. 'world.create'
  blockHeight: number;
  ownerAddress: string;
  body: Record<string, unknown>; // request intent (without signature/message)
  signMessage: (message: string) => Promise<string>;
  ttlMs?: number;
}

export class SignedMutationError extends Error {}

/**
 * Build + sign an action-bound request and send it. Returns the raw Response so
 * callers can inspect status and parse JSON as they see fit. Throws
 * SignedMutationError if the challenge cannot be obtained or signing fails
 * (e.g. user rejects the wallet prompt).
 */
export async function signedWorldFetch(opts: SignedMutationOptions): Promise<Response> {
  const { method, path, action, blockHeight, ownerAddress, body, signMessage } = opts;

  // 1. fresh one-time nonce
  const challengeRes = await fetch('/api/v1/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: ownerAddress, purpose: 'world' }),
  });
  const challengeJson = await challengeRes.json().catch(() => null);
  const nonce: string | undefined = challengeJson?.data?.nonce ?? challengeJson?.nonce;
  if (!challengeRes.ok || !nonce) {
    throw new SignedMutationError(challengeJson?.error || 'Could not obtain authorization challenge');
  }

  // 2. canonical bound message over the exact intent body
  const intentBody = { ...body, ownerAddress };
  const bodyHash = await hashBody(intentBody);
  const expiresAt = Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS);
  const message = buildActionMessage({ action, method, path, blockHeight, bodyHash, nonce, expiresAt });

  // 3. sign (may throw if the user rejects)
  let signature: string;
  try {
    signature = await signMessage(message);
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Signature rejected';
    throw new SignedMutationError(m);
  }
  if (!signature) throw new SignedMutationError('Wallet returned no signature');

  // 4. send
  return fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...intentBody, signature, message }),
  });
}
