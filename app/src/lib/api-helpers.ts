import { NextResponse } from 'next/server';
import { verifyBip322 } from '@/lib/bip322';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Wrap a successful API response in the standard `{ success: true, data }` envelope.
 * @param data - Response payload
 * @param status - HTTP status code (default 200)
 * @param headers - Extra response headers (e.g. sandbox `X-RateLimit-*`)
 */
export function success<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ success: true as const, data }, { status, headers });
}

/**
 * Wrap an error API response. Sanitizes internal details on 500s in production.
 * @param message - Error description (sanitized in prod for 5xx)
 * @param status - HTTP status code (default 400)
 */
export function error(message: string, status = 400): NextResponse<ErrorResponse> {
  // In production, don't leak internal error details on 500s
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : message;
  return NextResponse.json({ success: false as const, error: safeMessage }, { status });
}

/** After `<`, these start a tag, end tag, comment/doctype or processing instruction. */
const TAG_OPENER = /[A-Za-z!/?]/;

/**
 * Sanitize user input: trim whitespace, truncate to maxLength, strip HTML tags.
 *
 * Every `<…>` span is removed, and so is every `<` left over that could still
 * open a tag (followed by a letter, `/`, `!`, `?`, or nothing). The single
 * `.replace(/<[^>]*>/g, '')` this replaces kept `<img src=x onerror=…` whenever
 * no `>` followed it, and that turns into a live tag the moment a consumer
 * appends markup (CodeQL js/incomplete-multi-character-sanitization). A `<`
 * that HTML reads as text (`a < b`, `<3`) is kept. One linear pass.
 *
 * @param str - Raw user input
 * @param maxLength - Maximum allowed length (default 500)
 */
export function sanitizeString(str: string, maxLength = 500): string {
  const s = str.trim().slice(0, maxLength);
  let out = '';
  let closeAhead = true;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '<') {
      out += s[i++];
      continue;
    }
    if (closeAhead) {
      const close = s.indexOf('>', i + 1);
      if (close !== -1) {
        i = close + 1; // a whole tag
        continue;
      }
      closeAhead = false; // no '>' anywhere after here
    }
    // A '<' that nothing can close. Take its whole run at once, so dropping one
    // '<' cannot leave another touching the letter that follows.
    let j = i;
    while (j < s.length && s[j] === '<') j++;
    if (j < s.length && !TAG_OPENER.test(s[j])) out += s.slice(i, j);
    i = j;
  }
  return out;
}

/**
 * Validate a Bitcoin address format. Accepts bc1 (bech32/bech32m), 1 (P2PKH), and 3 (P2SH).
 * Does NOT verify checksum — pattern check only.
 */
export function isValidBitcoinAddress(address: string): boolean {
  // Basic validation — accepts bc1, 1, 3 prefixed addresses
  return /^(bc1[a-zA-HJ-NP-Z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
}

/**
 * Verify a BIP-322 wallet signature.
 *
 * Delegates to `lib/bip322.ts`, which accepts the base64 / base64url / hex
 * encodings different ordinals wallets emit and fails closed on everything else.
 */
export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  return verifyBip322(address, message, signature);
}

/** The header every action-bound message starts with (`lib/action-message.ts`). */
const ACTION_MESSAGE_HEADER = /^\s*Block Genomics Authorization\b/;

/** A 64-hex token: the shape of every server-issued challenge nonce (`lib/challenges.ts`). */
const NONCE_TOKEN = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i;

/**
 * Signature check for the legacy routes that consume no nonce and verify no
 * action binding (the E2E-06 class), where any message the wallet signed passes.
 *
 * Those routes must at least refuse the message shapes the server issues for its
 * bound flows: an action-bound `Block Genomics Authorization` message, or any
 * message carrying a challenge nonce. Signatures over exactly those shapes are
 * published on purpose — an experience's `manifestSignature` + `manifestMessage`
 * is a public attestation — and without this check anyone could lift one and
 * present it here as the owner. No client of these routes signs either shape.
 *
 * Not a replacement for binding: a signature over an ad-hoc string is still
 * replayable on these routes until each one moves to `verifyActionBinding` +
 * `consumeChallenge`.
 */
export function verifyUnboundWalletSignature(address: string, message: string, signature: string): boolean {
  if (typeof message !== 'string') return false;
  if (ACTION_MESSAGE_HEADER.test(message) || NONCE_TOKEN.test(message)) return false;
  return verifyBip322(address, message, signature);
}
