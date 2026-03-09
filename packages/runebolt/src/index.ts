/**
 * Lightning Deed Protocol (LDP) — Instant, non-custodial Rune & Bitmap transfers over Lightning.
 *
 * Transfer the cryptographic RIGHT to claim an asset, not the asset itself.
 */

export const LDP_VERSION = '0.1.0';

export {
  createDeedLock,
  buildDeedLockScript,
  buildClaimScript,
  buildRecoveryScript,
  createDeedLockTransaction,
} from './DeedLock';
export type { DeedLockUTXO, DeedLockResult } from './DeedLock';

export {
  createClaimTransaction,
  validateClaim,
  batchClaim,
} from './DeedClaim';
export type { DeedLockOutputInfo } from './DeedClaim';

export {
  createLDPInvoice,
  encodeLDPInvoice,
  decodeLDPInvoice,
} from './LDPInvoice';
export type { LDPInvoice } from './LDPInvoice';

export {
  createBitmapDeed,
  createBitmapDeedTransaction,
  claimBitmapDeed,
  validateBitmapClaim,
} from './BitmapDeed';
export type { BitmapUTXO, BitmapDeedResult } from './BitmapDeed';

export {
  createCorrespondingHTLC,
  verifyAtomicity,
  calculateSafeTimeouts,
  validateTimeoutSafety,
} from './HTLCBridge';
export type { HTLCParams, TimeoutConfig } from './HTLCBridge';

export { LDPClient } from './LDPClient';
export type {
  LightningClient,
  SenderWallet,
  RecipientWallet,
  TransferState,
  TransferSession,
} from './LDPClient';
