import { NextResponse } from 'next/server';

export function success(data: any, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function sanitizeString(str: string, maxLength = 500): string {
  return str.trim().slice(0, maxLength).replace(/<[^>]*>/g, '');
}

export function isValidBitcoinAddress(address: string): boolean {
  // Basic validation — accepts bc1, 1, 3 prefixed addresses
  return /^(bc1[a-zA-HJ-NP-Z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
}

/* MOCK — replace with real BIP-322 */
export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  // TODO: Implement real BIP-322 signature verification
  // For now, accept any non-empty signature
  return !!signature && signature.length > 0;
}
