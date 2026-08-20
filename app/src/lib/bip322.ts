/**
 * BIP-322 message-signature verification, tolerant of the encodings real
 * ordinals wallets emit.
 *
 * The verifier expects a standard-base64 signature. Wallets do not agree on that:
 *   - Xverse / sats-connect, Unisat, OKX, Magic Eden → standard base64
 *   - Leather and several CLI/hardware signers        → lowercase hex
 *   - Anything that round-tripped through a URL/JWT   → base64url (`-`/`_`)
 *   - Anything that round-tripped through a terminal,
 *     a YAML block or an LLM tool call                → wrapped with newlines
 *
 * Rejecting those as "invalid signature" is a false negative: the holder DID
 * sign, we just could not read their encoding. So we normalise into a small,
 * ordered candidate list and accept if ANY candidate verifies.
 *
 * SECURITY: trying several encodings does not weaken the gate. Each candidate
 * must independently be a cryptographically valid BIP-322 signature over the
 * exact (address, message) pair — re-encoding cannot manufacture one. The only
 * costs are bounded: `MAX_SIGNATURE_CHARS` caps the input and the candidate list
 * is capped at three, so a hostile caller cannot force unbounded EC work.
 *
 * Everything fails CLOSED — any throw, any malformed input, any empty argument
 * returns false. There is deliberately no "unsupported address type" success
 * path: `bip322-verify` covers P2PKH, P2WPKH, P2SH-P2WPKH and single-key P2TR,
 * so a rejection means a bad signature, not an unsupported wallet.
 */

import { verifyBip322Signature } from './bip322-verify';

/**
 * Upper bound on accepted signature input. A real BIP-322 signature is ~88–260
 * base64 chars; this leaves generous headroom while stopping a multi-megabyte
 * body from turning into decode + EC work.
 */
export const MAX_SIGNATURE_CHARS = 4096;

/** Upper bound on the signed message we will hand to the verifier. */
export const MAX_MESSAGE_CHARS = 4096;

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Ordered signature candidates to attempt, most-likely first.
 *
 * Order matters only for latency, never for correctness — a wrong candidate
 * fails verification rather than being accepted.
 *
 * 1. whitespace-stripped input as-is (the standard-base64 wallets)
 * 2. base64url → base64 (`-`→`+`, `_`→`/`), when those characters are present
 * 3. hex → base64, when the input is pure hex of even length (Leather et al.)
 *
 * Hex and base64 alphabets overlap (`"abcdef01"` is valid in both), so hex is
 * tried in ADDITION to — never instead of — the literal reading.
 *
 * @param raw Signature exactly as the caller supplied it.
 * @returns De-duplicated candidates; empty when the input is unusable.
 */
export function signatureCandidates(raw: string): string[] {
  if (typeof raw !== 'string') return [];

  // Strip ALL whitespace, not just the ends: PEM-style wrapping, YAML block
  // scalars and copy-paste through chat all inject interior newlines.
  const stripped = raw.replace(/\s+/g, '');
  if (!stripped || stripped.length > MAX_SIGNATURE_CHARS) return [];

  const candidates: string[] = [stripped];

  if (stripped.includes('-') || stripped.includes('_')) {
    candidates.push(stripped.replace(/-/g, '+').replace(/_/g, '/'));
  }

  if (stripped.length % 2 === 0 && HEX_RE.test(stripped)) {
    try {
      const asBase64 = Buffer.from(stripped, 'hex').toString('base64');
      if (asBase64) candidates.push(asBase64);
    } catch {
      /* not usable as hex — the literal reading above still stands */
    }
  }

  return [...new Set(candidates)].slice(0, 3);
}

/**
 * Verify a BIP-322 signature over `message` by `address`.
 *
 * @param address   Bitcoin address claimed to have signed (P2PKH/P2WPKH/P2SH-P2WPKH/P2TR).
 * @param message   Exact message that was signed.
 * @param signature Signature in base64, base64url or hex.
 * @returns true only on a cryptographically valid signature. Fails closed.
 */
export function verifyBip322(address: string, message: string, signature: string): boolean {
  if (!address || !message || !signature) return false;
  if (typeof address !== 'string' || typeof message !== 'string') return false;
  if (message.length > MAX_MESSAGE_CHARS) return false;

  for (const candidate of signatureCandidates(signature)) {
    try {
      if (verifyBip322Signature(address, message, candidate)) return true;
    } catch {
      // A throw means malformed input or a bad signature for this encoding.
      // Keep trying the remaining candidates; never treat it as success.
    }
  }
  return false;
}
