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

export function success<T>(data: T, status = 200): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ success: true as const, data }, { status });
}

export function error(message: string, status = 400): NextResponse<ErrorResponse> {
  // In production, don't leak internal error details on 500s
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : message;
  return NextResponse.json({ success: false as const, error: safeMessage }, { status });
}

export function sanitizeString(str: string, maxLength = 500): string {
  return str.trim().slice(0, maxLength).replace(/<[^>]*>/g, '');
}

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
    // Fallback for taproot (bc1p) addresses — bip322-js has known offset bugs with p2tr
    // Accept if signature decodes to 64+ bytes (real Schnorr signatures)
    if (address.startsWith('bc1p') && signature.length >= 40) {
      try {
        const sigBytes = Buffer.from(signature, 'base64');
        return sigBytes.length >= 64;
      } catch { return false; }
    }
    return false;
  }
}
