import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bip322 = require('bip322-js');

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
 */
export function success<T>(data: T, status = 200): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ success: true as const, data }, { status });
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

/**
 * Sanitize user input: trim whitespace, truncate to maxLength, strip HTML tags.
 * @param str - Raw user input
 * @param maxLength - Maximum allowed length (default 500)
 */
export function sanitizeString(str: string, maxLength = 500): string {
  return str.trim().slice(0, maxLength).replace(/<[^>]*>/g, '');
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
 * Verify BIP-322 wallet signature.
 * Uses bip322-js for real cryptographic verification.
 */
export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  if (!address || !message || !signature) return false;
  try {
    return bip322.Verifier.verifySignature(address, message, signature);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.warn('[auth] BIP-322 lib error (likely taproot):', errMsg);
    // SECURITY: Do NOT accept unverified signatures for taproot (bc1p) addresses.
    // bip322-js has known issues with p2tr but the previous fallback accepted ANY
    // 64-byte base64 string, which is a complete auth bypass. Proper Schnorr
    // verification (e.g. via @noble/secp256k1) is needed for taproot support.
    return false;
  }
}
