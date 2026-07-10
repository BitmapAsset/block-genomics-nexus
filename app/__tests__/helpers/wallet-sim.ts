/**
 * Real-keypair / real-BIP-322 helpers for isolated simulation tests.
 * Generates genuine P2PKH / P2WPKH / P2TR mainnet keypairs and produces real
 * BIP-322 signatures via bip322-js — no live chain, no network.
 *
 * NOT collected by Jest (filename is not *.test.ts).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Signer } from 'bip322-js';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc as any);
const ECPair = ECPairFactory(ecc as any);

export type AddrKind = 'p2pkh' | 'p2wpkh' | 'p2tr';

export interface SimWallet {
  wif: string;
  address: string;
  kind: AddrKind;
}

export function makeWallet(kind: AddrKind = 'p2tr'): SimWallet {
  const kp = ECPair.makeRandom();
  const wif = kp.toWIF();
  const pubkey = Buffer.from(kp.publicKey);
  let address: string | undefined;
  if (kind === 'p2wpkh') address = bitcoin.payments.p2wpkh({ pubkey }).address;
  else if (kind === 'p2tr') address = bitcoin.payments.p2tr({ internalPubkey: pubkey.subarray(1, 33) }).address;
  else address = bitcoin.payments.p2pkh({ pubkey }).address;
  if (!address) throw new Error(`failed to derive ${kind} address`);
  return { wif, address, kind };
}

export function sign(wif: string, address: string, message: string): string {
  const sig: any = Signer.sign(wif, address, message);
  return typeof sig === 'string' ? sig : Buffer.from(sig).toString('base64');
}

let nonceCounter = 0;
/** Deterministic 64-hex nonce (avoids Date.now / Math.random for reproducibility). */
export function freshNonce(): string {
  nonceCounter += 1;
  return (nonceCounter.toString(16).padStart(8, '0') + 'ab'.repeat(28)).slice(0, 64);
}

/** The exact message format /api/v1/challenge issues (wallet signs this). */
export function challengeMessage(nonce: string): string {
  return `Block Genomics verification: ${nonce}`;
}
