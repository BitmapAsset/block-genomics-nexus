/**
 * Canonical experience-manifest hashing for the agent SDK.
 *
 * A self-hosted experience is authorized by a BIP-322 signature whose Body
 * binding is the hash of the manifest itself — that is what makes a registration
 * tamper-evident to a third party. So this file decides signed bytes, and the
 * region below is mirrored byte-for-byte from app/src/lib/experience-protocol.ts.
 * A one-character divergence produces a hash the server will not accept.
 *
 * Pure: no node built-ins, no network. Uses the same stableStringify/sha256Hex
 * as the action-message signing core.
 */

import { stableStringify, sha256Hex } from './action-message';

/** Manifest envelope schema version (NOT the operator's content version). */
export const MANIFEST_VERSION = 1;

// ===== BEGIN SHARED MANIFEST CANON (keep byte-identical: app/src/lib/experience-protocol.ts <-> sdk/agent-connect/src/experience-manifest.ts) =====
/**
 * Shape accepted by the canonicalizer: either a client body or a stored row.
 * Deliberately loose so the same function hashes a request and a DB record.
 */
export interface CanonicalManifestInput {
  manifestVersion?: number | null;
  blockHeight: number;
  parcelIndex?: number | null;
  name: string;
  description?: string | null;
  experienceType: string;
  entryUrl: string;
  transport: string;
  healthUrl?: string | null;
  clientRequirements?: unknown;
  capabilities?: string[] | null;
  contentRating?: string | null;
  version: string;
  contentHash?: string | null;
}

/**
 * Normalize a manifest to the exact object that gets hashed.
 *
 * Both sides — the client before signing, and the server when re-deriving the
 * hash from a stored row years later — must produce byte-identical output, so
 * every defaulting rule lives here and nowhere else:
 *
 * - `healthUrl` is resolved to its EFFECTIVE value (`entryUrl` when omitted),
 *   because that is what the server persists. Hashing the raw omitted value
 *   would make a stored row un-rehashable.
 * - Empty/absent optionals are dropped rather than encoded as `null`, so
 *   "omitted" and "explicitly null" hash the same.
 * - An empty `capabilities` array is dropped for the same reason.
 * - `capabilities` order is PRESERVED. It is owner-chosen presentation order,
 *   and sorting it would silently rewrite the operator's intent.
 * - `clientRequirements` is accepted as an object or as the JSON string the DB
 *   stores it in; both normalize to the same object. Key order is irrelevant —
 *   `stableStringify` sorts keys.
 */
export function canonicalManifest(input: CanonicalManifestInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    manifestVersion: input.manifestVersion ?? MANIFEST_VERSION,
    blockHeight: input.blockHeight,
    name: input.name,
    experienceType: input.experienceType,
    entryUrl: input.entryUrl,
    transport: input.transport,
    healthUrl: input.healthUrl ?? input.entryUrl,
    version: input.version,
  };

  if (input.parcelIndex != null) out.parcelIndex = input.parcelIndex;
  if (input.description != null && input.description !== '') out.description = input.description;
  if (input.contentRating != null) out.contentRating = input.contentRating;
  if (input.contentHash != null) out.contentHash = input.contentHash;
  if (input.capabilities != null && input.capabilities.length > 0) out.capabilities = input.capabilities;

  const cr = normalizeClientRequirements(input.clientRequirements);
  if (cr) out.clientRequirements = cr;

  return out;
}

function normalizeClientRequirements(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['platform', 'minVersion', 'downloadUrl']) {
    if (obj[key] != null && obj[key] !== '') out[key] = obj[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * SHA-256 hex of the canonical manifest. This is the value bound into the
 * owner's BIP-322 authorization, so it is the anchor of the whole trust chain:
 * deed on Bitcoin → BIP-322 signature → this hash → the stored manifest.
 */
export async function computeManifestHash(input: CanonicalManifestInput): Promise<string> {
  return sha256Hex(stableStringify(canonicalManifest(input)));
}
// ===== END SHARED MANIFEST CANON =====
