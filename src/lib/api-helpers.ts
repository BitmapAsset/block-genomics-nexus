import { NextResponse } from 'next/server';

export function success(data: any, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function error(message: string, status = 400) {
  // In production, don't leak internal error details on 500s
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : message;
  return NextResponse.json({ success: false, error: safeMessage }, { status });
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
    const { Verifier } = require('bip322-js');
    return Verifier.verifySignature(address, message, signature);
  } catch (e: any) {
    // If library fails, do NOT fall back to permissive check — reject
    console.error('[auth] BIP-322 verification failed:', e?.message);
    return false;
  }
}
