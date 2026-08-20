/**
 * Signed-manifest integrity for federated (self-hosted) experiences.
 *
 * THE TRUST CHAIN — three links, none of which require a chain write:
 *
 *   1. DEED      the bitmap inscription on Bitcoin says who owns the block.
 *   2. SIGNATURE a BIP-322 signature from that wallet authorizes the write, and
 *                is action-bound (§7.2) so it cannot be replayed or re-pointed.
 *   3. MANIFEST  the `Body:` field of that signed message is the canonical hash
 *                of the manifest itself, so the signature commits to the exact
 *                manifest bytes — not merely to "some request happened".
 *
 * Link 3 is what makes tampering DETECTABLE BY A THIRD PARTY. Because the signed
 * message stores the manifest hash (and not a request-shaped body hash), anyone
 * holding a published experience record can, with no trust in this server:
 *   re-derive the canonical hash from the record's own fields, confirm it equals
 *   the `Body:` binding inside the stored message, and verify the BIP-322
 *   signature over that message against the record's wallet.
 * If we — or anyone with database access — altered a stored manifest, step one
 * would disagree and the record would be provably forged.
 *
 * Signing is OPTIONAL for back-compat: experiences registered before this
 * existed, and clients still using the plain challenge flow, remain valid and
 * simply report `signed: false`. What is NOT optional is correctness — a
 * signature that is present but does not verify is a hard failure at write time
 * (fail closed), never a downgrade to unsigned.
 */

import { verifyAgentSignature } from '@/lib/agent-protocol';
import { verifyActionBinding, parseActionMessage } from '@/lib/action-message';
import { computeManifestHash, type CanonicalManifestInput } from '@/lib/experience-protocol';

/** Semantic action labels bound into the signed message. */
export const EXPERIENCE_ACTIONS = {
  register: 'experience.register',
  update: 'experience.update',
  remove: 'experience.remove',
} as const;

export type ExperienceAction = (typeof EXPERIENCE_ACTIONS)[keyof typeof EXPERIENCE_ACTIONS];

export type SignedManifestResult =
  | { ok: true; nonce: string; manifestHash: string }
  | { ok: false; status: number; error: string };

export interface SignedManifestParams {
  walletAddress: string;
  /** The canonical action message the wallet signed. */
  message: string;
  signature: string;
  action: ExperienceAction;
  method: string;
  /** Exact route path, e.g. `/api/v1/experiences` or `/api/v1/experiences/{id}`. */
  path: string;
  blockHeight: number;
  /** Canonical hash of the manifest this call results in. */
  manifestHash: string;
  now?: number;
}

/**
 * Verify an action-bound signature that commits to `manifestHash`.
 *
 * Does NOT consume the nonce — the caller consumes `nonce` atomically after the
 * ownership check, matching the world-write ordering so an indexer outage costs
 * a retry rather than a burnt challenge.
 */
export function verifySignedManifest(params: SignedManifestParams): SignedManifestResult {
  const { walletAddress, message, signature, action, method, path, blockHeight, manifestHash } = params;

  if (!verifyAgentSignature(walletAddress, message, signature)) {
    return { ok: false, status: 401, error: 'Invalid wallet signature over the authorization message' };
  }

  const binding = verifyActionBinding(
    message,
    { action, method, path, blockHeight, bodyHash: manifestHash },
    params.now,
  );
  if (!binding.ok) {
    return { ok: false, status: 401, error: binding.reason ?? 'Authorization binding mismatch' };
  }

  return { ok: true, nonce: binding.nonce!, manifestHash };
}

// ─── Third-party verification of a stored record ─────────────────

export interface StoredExperienceRecord extends CanonicalManifestInput {
  walletAddress: string;
  manifestHash?: string | null;
  manifestMessage?: string | null;
  manifestSignature?: string | null;
}

export interface IntegrityReport {
  /** True when this record carries an owner signature at all. */
  signed: boolean;
  /** Hash re-derived from the record's own fields, right now. */
  computedManifestHash: string;
  /** Hash stored alongside the record at write time. */
  storedManifestHash: string | null;
  /** Stored hash === re-derived hash. False ⇒ the stored manifest was altered. */
  manifestHashMatches: boolean;
  /** The signed message's `Body:` binding === re-derived hash. */
  signatureCoversManifest: boolean;
  /** BIP-322 signature verifies against the record's wallet. */
  signatureValid: boolean;
  /** Every applicable check passed. */
  verified: boolean;
  /** Human-readable failure reasons, empty when `verified`. */
  issues: string[];
}

/**
 * Re-derive and check a stored experience's integrity. Pure and offline — no
 * network, no database — so a third party can reimplement it from the spec and
 * reach the same verdict against a published record.
 */
export async function verifyStoredManifest(record: StoredExperienceRecord): Promise<IntegrityReport> {
  const computedManifestHash = await computeManifestHash(record);
  const storedManifestHash = record.manifestHash ?? null;
  const issues: string[] = [];

  const manifestHashMatches = storedManifestHash !== null && storedManifestHash === computedManifestHash;
  if (storedManifestHash === null) {
    issues.push('No manifest hash stored for this record (registered before integrity was enforced).');
  } else if (!manifestHashMatches) {
    issues.push('Stored manifest hash does not match the manifest — the record has been altered.');
  }

  const signed = Boolean(record.manifestMessage && record.manifestSignature);
  let signatureValid = false;
  let signatureCoversManifest = false;

  if (signed) {
    signatureValid = verifyAgentSignature(record.walletAddress, record.manifestMessage!, record.manifestSignature!);
    if (!signatureValid) issues.push('Stored BIP-322 signature does not verify against the owner wallet.');

    const parsed = parseActionMessage(record.manifestMessage!);
    if (!parsed) {
      issues.push('Stored authorization message is malformed.');
    } else {
      signatureCoversManifest = parsed.bodyHash === computedManifestHash;
      if (!signatureCoversManifest) {
        issues.push('The signature commits to a different manifest than the one stored.');
      }
    }
  } else {
    issues.push('This experience is unsigned — ownership was proven, but the manifest is not tamper-evident.');
  }

  const verified = signed && signatureValid && signatureCoversManifest && manifestHashMatches;

  return {
    signed,
    computedManifestHash,
    storedManifestHash,
    manifestHashMatches,
    signatureCoversManifest,
    signatureValid,
    verified,
    issues,
  };
}
