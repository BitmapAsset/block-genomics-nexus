/**
 * HTLCBridge — Ensures atomicity between Bitcoin deed-locks and Lightning HTLCs.
 *
 * The critical safety property: the Lightning HTLC must expire BEFORE the
 * Bitcoin CSV timelock. This ensures the sender cannot double-spend the
 * deed-locked UTXO after the Lightning payment completes.
 *
 * Timeline:
 *   t=0: Deed-lock created (Bitcoin)
 *   t=T_lightning: Lightning HTLC expires (must be < T_bitcoin)
 *   t=T_bitcoin: Bitcoin CSV timelock expires (owner can recover)
 *
 * Safety margin: T_bitcoin - T_lightning >= SAFETY_MARGIN_BLOCKS
 */

import * as crypto from 'crypto';

/** Default safety margin: Lightning must expire at least 6 blocks before Bitcoin */
const DEFAULT_SAFETY_MARGIN_BLOCKS = 6;

/** Average Bitcoin block time in seconds */
const AVG_BLOCK_TIME_SECS = 600;

/** HTLC parameters for the Lightning side */
export interface HTLCParams {
  /** SHA256 payment hash (same as deed-lock) */
  paymentHash: Buffer;
  /** HTLC timeout in Lightning routing delta (blocks) */
  cltvDelta: number;
  /** Amount in satoshis */
  amountSats: number;
}

/** Timeout calculation result */
export interface TimeoutConfig {
  /** Bitcoin CSV timelock (blocks) for the deed-lock recovery path */
  bitcoinTimeoutBlocks: number;
  /** Lightning CLTV delta (blocks) for the HTLC */
  lightningCltvDelta: number;
  /** Safety margin between Lightning expiry and Bitcoin timelock */
  safetyMarginBlocks: number;
  /** Estimated time window for recipient to claim (seconds) */
  claimWindowSecs: number;
}

/**
 * Creates Lightning HTLC parameters that correspond to a Bitcoin deed-lock.
 *
 * The HTLC uses the same payment hash as the deed-lock script, binding them
 * atomically: revealing the preimage on Lightning also enables the Bitcoin claim.
 *
 * @param paymentHash - 32-byte SHA256 hash (from deed-lock)
 * @param amountSats - Lightning payment amount
 * @param cltvDelta - CLTV delta for the HTLC (default: 40 blocks)
 */
export function createCorrespondingHTLC(
  paymentHash: Buffer,
  amountSats: number,
  cltvDelta: number = 40
): HTLCParams {
  if (paymentHash.length !== 32) throw new Error('paymentHash must be 32 bytes');
  if (amountSats < 1) throw new Error('amountSats must be >= 1');
  if (cltvDelta < 9) throw new Error('cltvDelta must be >= 9 (Lightning minimum)');

  return {
    paymentHash: Buffer.from(paymentHash),
    cltvDelta,
    amountSats,
  };
}

/**
 * Verifies that the Bitcoin deed-lock and Lightning HTLC use the same payment hash.
 *
 * This is the atomic guarantee: both sides are bound to the same preimage.
 * If the hashes differ, the protocol breaks — revealing the Lightning preimage
 * would NOT unlock the Bitcoin deed.
 *
 * @returns true if both hashes match
 */
export function verifyAtomicity(
  bitcoinDeedHash: Buffer,
  lightningPaymentHash: Buffer
): boolean {
  if (bitcoinDeedHash.length !== 32 || lightningPaymentHash.length !== 32) {
    return false;
  }
  return bitcoinDeedHash.equals(lightningPaymentHash);
}

/**
 * Calculates safe timeout values ensuring Lightning expires before Bitcoin.
 *
 * The Bitcoin CSV timelock MUST be longer than the Lightning CLTV delta by at
 * least the safety margin. This prevents a race condition where:
 *   1. Lightning HTLC is still pending
 *   2. Bitcoin timelock expires
 *   3. Sender recovers the deed-locked UTXO
 *   4. Lightning payment eventually settles → sender keeps both sats AND asset
 *
 * @param bitcoinTimeoutBlocks - Desired Bitcoin CSV timelock
 * @param lightningCltvDelta - Desired Lightning CLTV delta
 * @param safetyMarginBlocks - Minimum gap (default: 6 blocks ≈ 1 hour)
 */
export function calculateSafeTimeouts(
  bitcoinTimeoutBlocks: number,
  lightningCltvDelta: number,
  safetyMarginBlocks: number = DEFAULT_SAFETY_MARGIN_BLOCKS
): TimeoutConfig {
  if (bitcoinTimeoutBlocks < 1) throw new Error('bitcoinTimeoutBlocks must be >= 1');
  if (lightningCltvDelta < 9) throw new Error('lightningCltvDelta must be >= 9');

  // Ensure Bitcoin timeout > Lightning timeout + safety margin
  let adjustedBitcoinTimeout = bitcoinTimeoutBlocks;
  let adjustedLightningDelta = lightningCltvDelta;

  if (adjustedBitcoinTimeout <= adjustedLightningDelta + safetyMarginBlocks) {
    // Extend Bitcoin timeout to maintain safety margin
    adjustedBitcoinTimeout = adjustedLightningDelta + safetyMarginBlocks;
  }

  const claimWindowBlocks = adjustedBitcoinTimeout - adjustedLightningDelta;
  const claimWindowSecs = claimWindowBlocks * AVG_BLOCK_TIME_SECS;

  return {
    bitcoinTimeoutBlocks: adjustedBitcoinTimeout,
    lightningCltvDelta: adjustedLightningDelta,
    safetyMarginBlocks: adjustedBitcoinTimeout - adjustedLightningDelta,
    claimWindowSecs,
  };
}

/**
 * Validates that a timeout configuration is safe for LDP.
 *
 * @returns An object with `safe` boolean and `reason` if unsafe.
 */
export function validateTimeoutSafety(
  config: TimeoutConfig
): { safe: boolean; reason?: string } {
  if (config.lightningCltvDelta < 9) {
    return { safe: false, reason: 'Lightning CLTV delta below minimum (9)' };
  }

  if (config.bitcoinTimeoutBlocks <= config.lightningCltvDelta) {
    return {
      safe: false,
      reason: `Bitcoin timeout (${config.bitcoinTimeoutBlocks}) must be > Lightning CLTV (${config.lightningCltvDelta})`,
    };
  }

  if (config.safetyMarginBlocks < DEFAULT_SAFETY_MARGIN_BLOCKS) {
    return {
      safe: false,
      reason: `Safety margin (${config.safetyMarginBlocks}) below minimum (${DEFAULT_SAFETY_MARGIN_BLOCKS})`,
    };
  }

  return { safe: true };
}
