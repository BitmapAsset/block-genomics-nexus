/**
 * Ownership gate for experience mutations (register / update / delete).
 *
 * This is the SAME fail-closed path the agent-register route uses — it reuses
 * the exact primitives (BIP-322 verifier from agent-protocol, single-use
 * server challenge, live on-chain re-verify) rather than reimplementing or
 * weakening any of them:
 *
 *   1. BIP-322 signature over the server-issued challenge  → 401 on failure
 *   2. atomic single-use challenge consume (replay-safe)   → 401 on failure
 *   3. live on-chain ownership re-verify                    → 403 when the wallet
 *      does not hold the block right now, 503 when no indexer can say. The DB
 *      snapshot is never consulted: it is a cache, and a stale cache is the
 *      failure this exists to prevent.
 */

import { verifyAgentSignature } from '@/lib/agent-protocol';
import { consumeChallenge, consumeChallengeFromMessage } from '@/lib/challenges';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { verifySignedManifest, type ExperienceAction } from '@/lib/experience-integrity';

export type OwnerGateResult = { ok: true } | { ok: false; status: number; error: string };

export async function verifyExperienceOwnerGate(params: {
  walletAddress: string;
  blockHeight: number;
  signature: string;
  challenge: string;
  purpose: string;
}): Promise<OwnerGateResult> {
  const { walletAddress, blockHeight, signature, challenge, purpose } = params;

  // 1. BIP-322 wallet signature (reuses agent-protocol verifier; fail-closed).
  if (!verifyAgentSignature(walletAddress, challenge, signature)) {
    return { ok: false, status: 401, error: 'Invalid wallet signature' };
  }

  // 2. Replay protection: the challenge must be server-issued and is atomically
  //    consumed — a self-supplied or replayed challenge is rejected.
  if (!(await consumeChallengeFromMessage(walletAddress, challenge, { purpose }))) {
    return { ok: false, status: 401, error: 'Invalid, expired, or already-used challenge — request one from /api/v1/challenge' };
  }

  return verifyLiveBlockOwnership(walletAddress, blockHeight);
}

/**
 * Live, fail-closed on-chain ownership check.
 *
 * This is a thin adapter over `requireLiveBlockOwner` — the ownership gate's
 * check 3 — so there is exactly ONE implementation of "does this wallet hold
 * this block right now?" in the app, and it is the strict one.
 *
 * It used to be a second implementation: it re-verified live, then treated an
 * INDETERMINATE result as permission to fall back to the `Block.ownerAddress`
 * snapshot. Indeterminate is not a rare edge — `verifyBlockOwnership` returns it
 * whenever the indexer is unreachable OR our own DB has no `inscriptionId`
 * linked for the block. The gate answers that same situation with a retryable
 * 503, so the two implementations disagreed exactly where it mattered, and an
 * attacker who could make the indexer fail — or who simply picked a block we
 * had never linked an inscription for — got the lenient one, with a stale
 * snapshot naming the seller as the grant.
 */
export async function verifyLiveBlockOwnership(
  walletAddress: string,
  blockHeight: number,
): Promise<OwnerGateResult> {
  const gate = await requireLiveBlockOwner(walletAddress, blockHeight);
  if (gate.ok) return { ok: true };
  return { ok: false, status: gate.status, error: gate.reason ?? 'Ownership check failed' };
}

export type ExperienceAuthResult =
  | { ok: true; signed: boolean }
  | { ok: false; status: number; error: string };

/**
 * Authorize an experience write in either of the two supported modes.
 *
 * SIGNED (preferred): the body carries `message` — a canonical action-bound
 * authorization whose `Body:` field is the manifest hash. The signature commits
 * to the exact manifest, so the stored record becomes third-party verifiable.
 *
 * LEGACY: the body carries `challenge` — a bare server nonce. This proves the
 * wallet and blocks replay, but does NOT bind the manifest, so the record is not
 * tamper-evident. Retained so existing integrations keep working; new clients
 * should sign.
 *
 * Both modes run the identical live on-chain ownership gate. Mode is chosen by
 * which field is present, never by a client-supplied flag — a caller cannot ask
 * to be checked more weakly.
 */
export async function authorizeExperienceWrite(params: {
  walletAddress: string;
  blockHeight: number;
  signature: string;
  challenge?: string;
  message?: string;
  purpose: string;
  action: ExperienceAction;
  method: string;
  path: string;
  manifestHash: string;
  now?: number;
}): Promise<ExperienceAuthResult> {
  const { walletAddress, blockHeight, signature, challenge, message, purpose } = params;

  if (message) {
    const signedCheck = verifySignedManifest({
      walletAddress,
      message,
      signature,
      action: params.action,
      method: params.method,
      path: params.path,
      blockHeight,
      manifestHash: params.manifestHash,
      now: params.now,
    });
    if (!signedCheck.ok) return signedCheck;

    // Ownership BEFORE nonce consumption: an indexer outage should cost a retry,
    // not a burnt challenge and another signing round-trip.
    const owns = await verifyLiveBlockOwnership(walletAddress, blockHeight);
    if (!owns.ok) return owns;

    if (!(await consumeChallenge(signedCheck.nonce, { address: walletAddress, purpose }))) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid, expired, or already-used challenge nonce — request one from /api/v1/challenge',
      };
    }
    return { ok: true, signed: true };
  }

  if (!challenge) {
    return {
      ok: false,
      status: 400,
      error: 'Missing authorization: send either `message` (signed manifest, preferred) or `challenge`',
    };
  }

  const gate = await verifyExperienceOwnerGate({ walletAddress, blockHeight, signature, challenge, purpose });
  if (!gate.ok) return gate;
  return { ok: true, signed: false };
}
