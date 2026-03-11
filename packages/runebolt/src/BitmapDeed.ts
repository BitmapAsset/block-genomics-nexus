/**
 * BitmapDeed — Deed-lock and claim for Bitmap inscriptions (Ordinals UTXOs).
 *
 * Bitmap inscriptions are just UTXOs containing ordinal sats. The same Tapscript
 * hash-lock mechanism works: we add a claim path gated by the Lightning preimage
 * and a recovery path with a CSV timelock.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as crypto from 'crypto';
import { initEccLib } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import {
  buildDeedLockScript,
  createDeedLockTransaction,
  DeedLockResult,
  DeedLockUTXO,
} from './DeedLock';
import {
  createClaimTransaction,
  DeedLockOutputInfo,
  validateClaim,
} from './DeedClaim';

initEccLib(ecc);

const { payments } = bitcoin;

/** Bitmap-specific UTXO with inscription metadata */
export interface BitmapUTXO extends DeedLockUTXO {
  /** The Bitmap block height (e.g. 840000 for bitmap 840000.bitmap) */
  blockHeight: number;
  /** Inscription ID (txid:index format) */
  inscriptionId?: string;
}

/** Result of creating a bitmap deed */
export interface BitmapDeedResult extends DeedLockResult {
  /** The Bitmap block height */
  blockHeight: number;
  /** The preimage for Lightning payment binding */
  preimage: Buffer;
}

/**
 * Creates a deed-lock for a Bitmap inscription UTXO.
 *
 * @param inscriptionUtxo - The UTXO containing the Bitmap inscription
 * @param recipientPubkey - 32-byte x-only pubkey of the recipient
 * @param timeoutBlocks - CSV timelock for owner recovery
 * @param preimage - Optional preimage; if omitted, one is generated
 * @param network - Bitcoin network
 */
export function createBitmapDeed(
  inscriptionUtxo: BitmapUTXO,
  recipientPubkey: Buffer,
  timeoutBlocks: number,
  preimage?: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
): BitmapDeedResult {
  const secret = preimage ?? crypto.randomBytes(32);
  const paymentHash = crypto.createHash('sha256').update(secret).digest();

  const { claimScript, recoveryScript, taprootTree } = buildDeedLockScript(
    paymentHash,
    recipientPubkey,
    inscriptionUtxo.ownerPubkey,
    timeoutBlocks
  );

  const NUMS_POINT = Buffer.from(
    '0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
    'hex'
  ).subarray(1);

  const p2tr = payments.p2tr({
    internalPubkey: NUMS_POINT,
    scriptTree: taprootTree,
    network,
  });

  return {
    outputScript: p2tr.output!,
    address: p2tr.address!,
    paymentHash,
    claimScript,
    recoveryScript,
    taprootTree,
    internalPubkey: NUMS_POINT,
    blockHeight: inscriptionUtxo.blockHeight,
    preimage: secret,
  };
}

/**
 * Creates the deed-lock transaction for a Bitmap inscription.
 *
 * Important: Bitmap UTXOs must preserve ordinal position. The inscription sat
 * must remain at the first output position to avoid accidental burns.
 *
 * @param inscriptionUtxo - Source UTXO with the Bitmap
 * @param deedResult - Result from createBitmapDeed
 * @param feeRate - Fee rate in sat/vbyte
 * @param network - Bitcoin network
 */
export function createBitmapDeedTransaction(
  inscriptionUtxo: BitmapUTXO,
  deedResult: BitmapDeedResult,
  feeRate: number = 2,
  network: bitcoin.Network = bitcoin.networks.bitcoin
): bitcoin.Psbt {
  // Delegate to the generic deed-lock transaction builder.
  // The Rune/Bitmap UTXO is the first output, preserving ordinal sat position.
  return createDeedLockTransaction(inscriptionUtxo, deedResult, feeRate, network);
}

/**
 * Claims a deed-locked Bitmap inscription using the Lightning preimage.
 *
 * @param deedUtxo - The deed-locked UTXO info
 * @param preimage - 32-byte Lightning payment preimage
 * @param recipientPrivkey - Recipient's private key
 * @param destinationAddress - Where to send the Bitmap inscription
 * @param feeRate - Fee rate in sat/vbyte
 * @param network - Bitcoin network
 */
export function claimBitmapDeed(
  deedUtxo: DeedLockOutputInfo & { blockHeight: number },
  preimage: Buffer,
  recipientPrivkey: Buffer,
  destinationAddress: string,
  feeRate: number = 2,
  network: bitcoin.Network = bitcoin.networks.bitcoin
): bitcoin.Psbt {
  return createClaimTransaction(
    deedUtxo,
    preimage,
    recipientPrivkey,
    destinationAddress,
    feeRate,
    network
  );
}

/**
 * Validates that a Bitmap deed can be claimed with the given preimage.
 */
export function validateBitmapClaim(
  deedUtxo: DeedLockOutputInfo,
  preimage: Buffer
): boolean {
  return validateClaim(deedUtxo, preimage);
}
