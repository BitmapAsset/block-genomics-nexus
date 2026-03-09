/**
 * DeedLock — Creates Tapscript hash-lock spending conditions for Rune UTXOs.
 *
 * The deed-lock adds a new Taproot spending path to a Rune UTXO:
 *   Path 1 (claim):    OP_SHA256 <paymentHash> OP_EQUALVERIFY <recipientPubkey> OP_CHECKSIG
 *   Path 2 (recovery): <timeoutBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP <ownerPubkey> OP_CHECKSIG
 *
 * These form a P2TR Taproot tree. The recipient claims by revealing the Lightning
 * payment preimage. The owner can recover after the timeout.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as crypto from 'crypto';
import { initEccLib } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types';
import * as ecc from 'tiny-secp256k1';

initEccLib(ecc);

const { script, payments, Psbt } = bitcoin;

/** UTXO reference for deed-locking */
export interface DeedLockUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: Buffer;
  /** x-only pubkey of the current owner */
  ownerPubkey: Buffer;
  /** Rune ID (block:tx format) */
  runeId?: string;
  /** Rune amount in base units */
  runeAmount?: bigint;
}

/** Result of creating a deed-lock */
export interface DeedLockResult {
  /** The Taproot output script for the deed-locked UTXO */
  outputScript: Buffer;
  /** The P2TR address */
  address: string;
  /** SHA256 hash used in the hash-lock (matches Lightning payment_hash) */
  paymentHash: Buffer;
  /** The claim leaf script */
  claimScript: Buffer;
  /** The recovery leaf script */
  recoveryScript: Buffer;
  /** Taproot tree for witness construction */
  taprootTree: Taptree;
  /** Unsigned PSBT (if transaction was built) */
  psbt?: bitcoin.Psbt;
  /** Internal pubkey used for the Taproot output */
  internalPubkey: Buffer;
}

/**
 * Builds the claim script (hash-lock + recipient signature).
 *
 *   OP_SHA256 <paymentHash> OP_EQUALVERIFY <recipientPubkey> OP_CHECKSIG
 */
export function buildClaimScript(paymentHash: Buffer, recipientPubkey: Buffer): Buffer {
  return script.compile([
    bitcoin.opcodes.OP_SHA256,
    paymentHash,
    bitcoin.opcodes.OP_EQUALVERIFY,
    recipientPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
}

/**
 * Builds the recovery script (timelock + owner signature).
 *
 *   <timeoutBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP <ownerPubkey> OP_CHECKSIG
 */
export function buildRecoveryScript(ownerPubkey: Buffer, timeoutBlocks: number): Buffer {
  return script.compile([
    script.number.encode(timeoutBlocks),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    ownerPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
}

/**
 * Builds the full deed-lock Taproot script tree.
 *
 * @returns Both leaf scripts and the Taptree structure.
 */
export function buildDeedLockScript(
  paymentHash: Buffer,
  recipientPubkey: Buffer,
  ownerPubkey: Buffer,
  timeoutBlocks: number
): { claimScript: Buffer; recoveryScript: Buffer; taprootTree: Taptree } {
  if (paymentHash.length !== 32) throw new Error('paymentHash must be 32 bytes');
  if (recipientPubkey.length !== 32) throw new Error('recipientPubkey must be 32 bytes (x-only)');
  if (ownerPubkey.length !== 32) throw new Error('ownerPubkey must be 32 bytes (x-only)');
  if (timeoutBlocks < 1 || timeoutBlocks > 65535) throw new Error('timeoutBlocks must be 1-65535');

  const claimScript = buildClaimScript(paymentHash, recipientPubkey);
  const recoveryScript = buildRecoveryScript(ownerPubkey, timeoutBlocks);

  const taprootTree: Taptree = [
    { output: claimScript },
    { output: recoveryScript },
  ];

  return { claimScript, recoveryScript, taprootTree };
}

/**
 * Creates a deed-lock for a Rune UTXO.
 *
 * Generates a fresh payment hash (for Lightning HTLC binding), constructs the
 * Tapscript tree, and returns everything needed to build the locking transaction.
 *
 * @param utxo - The Rune UTXO to deed-lock
 * @param recipientPubkey - 32-byte x-only pubkey of the recipient
 * @param timeoutBlocks - Blocks before owner can recover (CSV timelock)
 * @param preimage - Optional preimage; if omitted, one is generated
 * @param network - Bitcoin network (default: mainnet)
 */
export function createDeedLock(
  utxo: DeedLockUTXO,
  recipientPubkey: Buffer,
  timeoutBlocks: number,
  preimage?: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
): DeedLockResult & { preimage: Buffer } {
  const secret = preimage ?? crypto.randomBytes(32);
  const paymentHash = crypto.createHash('sha256').update(secret).digest();

  const { claimScript, recoveryScript, taprootTree } = buildDeedLockScript(
    paymentHash,
    recipientPubkey,
    utxo.ownerPubkey,
    timeoutBlocks
  );

  // Use an unspendable internal key (NUMS point) so only script-path spends work
  const NUMS_POINT = Buffer.from(
    '0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
    'hex'
  ).subarray(1); // x-only

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
    preimage: secret,
  };
}

/**
 * Creates an unsigned PSBT that sends the Rune UTXO to the deed-lock address.
 *
 * The PSBT moves the UTXO to the new P2TR output with the hash-lock tree.
 * Caller must sign with the owner's key.
 *
 * @param utxo - Source UTXO containing the Rune
 * @param deedLock - Result from createDeedLock
 * @param feeRate - Fee rate in sat/vbyte
 * @param network - Bitcoin network
 */
export function createDeedLockTransaction(
  utxo: DeedLockUTXO,
  deedLock: DeedLockResult,
  feeRate: number = 2,
  network: bitcoin.Network = bitcoin.networks.bitcoin
): bitcoin.Psbt {
  const psbt = new Psbt({ network });

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: utxo.scriptPubKey,
      value: utxo.value,
    },
  });

  // Estimate tx size: ~150 vbytes for 1-in 1-out Taproot
  const estimatedFee = Math.ceil(150 * feeRate);
  const outputValue = utxo.value - estimatedFee;

  if (outputValue < 546) {
    throw new Error(`Output value ${outputValue} below dust limit after fee ${estimatedFee}`);
  }

  psbt.addOutput({
    script: deedLock.outputScript,
    value: outputValue,
  });

  return psbt;
}
