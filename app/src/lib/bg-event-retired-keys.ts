/**
 * System event keys that are no longer current but still verify the events
 * they attested (bg-event/1, `/.well-known/bg-event-keys.json`).
 *
 * Rotating `BG_EVENT_SIGNING_KEY` would otherwise make every earlier
 * attestation unverifiable. Each entry is the PUBLIC half of a retired key and
 * the moment it stopped signing; `verifyEventProof` accepts it only for events
 * dated before `retiredAt`. Never put a seed here.
 *
 * Rotation (docs/RUNBOOK-CICD.md): in the same deploy that changes the env,
 * append the old key's `kid` and `publicKey` (both as the keys file served
 * them) with `retiredAt` = the moment the new key goes live.
 */

export interface RetiredSystemKey {
  /** `bg-sys-` + 16 hex, as `/.well-known/bg-event-keys.json` served it. */
  kid: string;
  /** base64 ed25519 public key, 32 bytes. */
  publicKey: string;
  /** ISO-8601 UTC; events dated at or after this are not accepted under the key. */
  retiredAt: string;
}

/** Empty today: the system key has never been set on production. */
export const RETIRED_SYSTEM_KEYS: readonly RetiredSystemKey[] = [];
