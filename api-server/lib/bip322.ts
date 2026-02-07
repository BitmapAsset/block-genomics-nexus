// ============================================================================
// BIP-322 Signature Verification
// ============================================================================
// MVP: Legacy (P2PKH) + SegWit (P2WPKH/P2SH-P2WPKH) via bitcoinjs-message.
// Taproot (P2TR / bc1p) is flagged for manual review — full BIP-322 for
// Schnorr signatures requires a more involved implementation.
// ============================================================================

import bitcoinMessage from 'bitcoinjs-message';

export type SignatureType = 'legacy' | 'segwit' | 'taproot-pending';

export interface VerificationResult {
  valid: boolean;
  signatureType: SignatureType;
  error?: string;
}

/**
 * Detect address type from its prefix.
 */
function detectAddressType(address: string): SignatureType {
  // Taproot — bc1p...
  if (address.startsWith('bc1p')) return 'taproot-pending';
  // Native SegWit — bc1q...
  if (address.startsWith('bc1q')) return 'segwit';
  // Legacy P2PKH (1...) or P2SH-wrapped SegWit (3...)
  if (address.startsWith('1') || address.startsWith('3')) return 'legacy';
  // Testnet
  if (address.startsWith('tb1p')) return 'taproot-pending';
  if (address.startsWith('tb1q')) return 'segwit';
  if (address.startsWith('m') || address.startsWith('n') || address.startsWith('2')) return 'legacy';
  return 'legacy'; // fallback
}

/**
 * Verify a Bitcoin message signature.
 *
 * - Legacy & SegWit: verified cryptographically via bitcoinjs-message.
 * - Taproot: returns valid=false with signatureType='taproot-pending'
 *   (needs manual review or future BIP-322 Schnorr implementation).
 */
export function verifySignature(
  message: string,
  address: string,
  signature: string,
): VerificationResult {
  const sigType = detectAddressType(address);

  // Taproot is not yet supported — flag for manual review
  if (sigType === 'taproot-pending') {
    return {
      valid: false,
      signatureType: 'taproot-pending',
      error: 'Taproot (BIP-322 Schnorr) signatures are not yet verified automatically. Flagged for manual review.',
    };
  }

  try {
    // bitcoinjs-message.verify handles both legacy and segwit
    // The third param `true` enables segwit prefix handling
    const isValid = bitcoinMessage.verify(
      message,
      address,
      Buffer.from(signature, 'base64'),
      undefined, // network prefix — defaults to mainnet
      true,      // checkSegwitAlways
    );

    return { valid: isValid, signatureType: sigType };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      signatureType: sigType,
      error: `Signature verification failed: ${errMsg}`,
    };
  }
}
