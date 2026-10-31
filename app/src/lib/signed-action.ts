// Server-side check for every signed write: the wallet signed the canonical
// action message for THIS request, and the one-time nonce inside it is consumed.
//
//   1. BIP-322 signature over `message` by `address`;
//   2. `verifyActionBinding`: the message names this action, method, exact path,
//      block and a hash of this request's body, and has not expired;
//   3. `consumeChallenge`: the nonce was issued by POST /api/v1/challenge to this
//      address for this purpose, is unexpired, and has never been used.
//
// Only after all three may a route read private state or mutate anything; the
// route's ownership gate then runs for `address`, the verified signer. A
// signature over any other text (an ad-hoc string, a published experience
// attestation, a binding made for another route, block or body) fails here.

import { hashBody, verifyActionBinding } from '@/lib/action-message';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';

export interface SignedActionSpec {
  /** Semantic label the client signs, e.g. 'guardian.update'. */
  action: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Exact route path incl. resource ids, e.g. '/api/v1/guardian/abc'. */
  path: string;
  /** The block being acted on; 0 for routes with no block. */
  blockHeight: number;
  /** Challenge purpose the nonce must have been issued for. */
  purpose: string;
}

export type SignedActionResult = { ok: true } | { ok: false; status: 401; error: string };

/** The 401 text for a request that does not carry a bound signature. */
export function signedActionHelp(spec: Pick<SignedActionSpec, 'action' | 'purpose'>): string {
  return (
    `Signed authorization required: get a nonce from POST /api/v1/challenge with purpose '${spec.purpose}', ` +
    `then sign the 'Block Genomics Authorization v1' message for action '${spec.action}'`
  );
}

/**
 * @param address   wallet the request acts for (must be the signer)
 * @param message   the signed canonical action message
 * @param signature BIP-322 signature over `message`
 * @param body      the request's intent object; `signature` / `message` are excluded from the hash
 */
export async function verifySignedAction(
  address: unknown,
  message: unknown,
  signature: unknown,
  body: Record<string, unknown>,
  spec: SignedActionSpec,
): Promise<SignedActionResult> {
  const deny = (reason: string): SignedActionResult => ({
    ok: false,
    status: 401,
    error: `${reason}. ${signedActionHelp(spec)}`,
  });
  if (typeof address !== 'string' || !address || typeof message !== 'string' || !message || typeof signature !== 'string' || !signature) {
    return deny('Missing wallet address, message or signature');
  }
  if (!verifyWalletSignature(address, message, signature)) return deny('Invalid signature');
  const binding = verifyActionBinding(message, {
    action: spec.action,
    method: spec.method,
    path: spec.path,
    blockHeight: spec.blockHeight,
    bodyHash: await hashBody(body),
  });
  if (!binding.ok || !binding.nonce) return deny(binding.reason || 'Invalid authorization');
  if (!(await consumeChallenge(binding.nonce, { address, purpose: spec.purpose }))) {
    return deny('Invalid or already-used challenge nonce');
  }
  return { ok: true };
}
