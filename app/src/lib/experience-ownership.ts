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
 *   3. live on-chain ownership re-verify                    → 403 on a definitive
 *      mismatch, even if a stale DB snapshot still says owner. Only an
 *      INDETERMINATE live result (no inscription linked / indexer outage) falls
 *      back to the DB snapshot. Never fails open on a mismatch.
 */

import prisma from '@/lib/prisma';
import { verifyAgentSignature } from '@/lib/agent-protocol';
import { consumeChallenge, consumeChallengeFromMessage } from '@/lib/challenges';
import { verifyAndSyncBlock } from '@/lib/ownership-sync';
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
 * Live, fail-closed on-chain ownership check, factored out so both the legacy
 * challenge flow and the signed-manifest flow use the SAME gate rather than two
 * implementations that could drift apart.
 */
export async function verifyLiveBlockOwnership(
  walletAddress: string,
  blockHeight: number,
): Promise<OwnerGateResult> {
  // 3. DB snapshot: fast path AND the fallback when live on-chain truth is
  //    unavailable (kept fresh by the ownership-sync cron + verified User record).
  const [block, user] = await Promise.all([
    prisma.block.findUnique({ where: { height: blockHeight }, select: { ownerAddress: true } }),
    prisma.user.findUnique({ where: { walletAddress }, select: { verified: true, anchorBlock: true, ownedBlocks: true } }),
  ]);
  const ownsSnapshot =
    block?.ownerAddress === walletAddress ||
    (user?.verified === true && (user.anchorBlock === blockHeight || user.ownedBlocks.includes(blockHeight)));

  // 4. Live on-chain re-verify (OPEN-2 parity): a live mismatch FAILS CLOSED even
  //    if the stale DB snapshot still says owner. Only an indeterminate live
  //    result (no inscription / indexer outage) defers to the snapshot.
  let verified: boolean;
  try {
    const live = await verifyAndSyncBlock(blockHeight, walletAddress);
    if (live.check.indeterminate) {
      console.warn(`[experiences] live re-verify indeterminate for block ${blockHeight} — falling back to DB snapshot`);
      verified = ownsSnapshot;
    } else if (!live.isOwner) {
      return { ok: false, status: 403, error: 'On-chain ownership check failed — wallet does not currently own this block on-chain' };
    } else {
      verified = true;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.warn(`[experiences] live re-verify threw for block ${blockHeight}; falling back to DB snapshot: ${msg}`);
    verified = ownsSnapshot;
  }

  if (!verified) {
    return { ok: false, status: 403, error: 'Wallet does not own this block — only the block owner can manage its experiences' };
  }
  return { ok: true };
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
