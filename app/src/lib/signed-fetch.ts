// Client helper: sign and send any action-bound request (the general form of
// `signedWorldFetch` in ./world-signing.ts).
//
//   1. POST /api/v1/challenge { walletAddress, purpose } -> one-time nonce.
//   2. hashBody(body) and buildActionMessage(action, method, path, block, hash,
//      nonce, expiry): the canonical text the server rebuilds from the request.
//   3. The wallet signs that text (BIP-322).
//   4. The request goes out as { ...body, message, signature }.
//
// The server checks every bound field and consumes the nonce, so the signature
// works for this one request only.

import { buildActionMessage, hashBody } from './action-message';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface SignedActionOptions {
  method: 'POST' | 'PATCH' | 'DELETE';
  /** Exact route path incl. ids, e.g. '/api/v1/guardian/abc'. */
  path: string;
  /** Action label the route expects, e.g. 'guardian.update'. */
  action: string;
  /** The block acted on; 0 for routes with no block. */
  blockHeight: number;
  /** Challenge purpose the route consumes, e.g. 'guardian'. */
  purpose: string;
  /** The wallet that signs (must be the address the body acts for). */
  address: string;
  /** The request intent, including its address field; no message/signature. */
  body: Record<string, unknown>;
  signMessage: (message: string) => Promise<string>;
  ttlMs?: number;
}

export class SignedActionError extends Error {}

export interface SignedAction {
  message: string;
  signature: string;
}

/** Steps 1-3: a nonce, the canonical message over `body`, and the wallet's signature. */
export async function signAction(opts: SignedActionOptions): Promise<SignedAction> {
  const challengeRes = await fetch('/api/v1/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: opts.address, purpose: opts.purpose }),
  });
  const challengeJson = await challengeRes.json().catch(() => null);
  const nonce: string | undefined = challengeJson?.data?.nonce ?? challengeJson?.nonce;
  if (!challengeRes.ok || !nonce) {
    throw new SignedActionError(challengeJson?.error || 'Could not obtain authorization challenge');
  }
  const message = buildActionMessage({
    action: opts.action,
    method: opts.method,
    path: opts.path,
    blockHeight: opts.blockHeight,
    bodyHash: await hashBody(opts.body),
    nonce,
    expiresAt: Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS),
  });
  let signature: string;
  try {
    signature = await opts.signMessage(message);
  } catch (err) {
    throw new SignedActionError(err instanceof Error ? err.message : 'Signature rejected');
  }
  if (!signature) throw new SignedActionError('Wallet returned no signature');
  return { message, signature };
}

/** Steps 1-4. Returns the raw Response; throws SignedActionError if signing fails. */
export async function signedActionFetch(opts: SignedActionOptions): Promise<Response> {
  const { message, signature } = await signAction(opts);
  return fetch(opts.path, {
    method: opts.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...opts.body, message, signature }),
  });
}
