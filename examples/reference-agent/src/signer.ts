// The agent's BIP-322 signer — the ONE place this program touches key material.
//
// Block Genomics never sees the private key. The SDK only ever calls
// signMessage() to obtain a BIP-322 signature over a server-issued challenge.
//
// The signing itself lives in ./bip322.ts, built on `@noble/curves` and
// `@scure/btc-signer` — the same audited primitives the server verifies with, so
// a signature produced here is guaranteed to pass server-side verification.

import { WIF } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { BitcoinSigner } from 'block-genomics-connect';
import { addressFromPublicKey, signBip322, type AddressType } from './bip322.js';

export type { AddressType };

/** Decode a mainnet WIF into its 32-byte private key. Throws on a malformed or testnet key. */
function privateKeyFromWif(wif: string): Uint8Array {
  return WIF().decode(wif);
}

/**
 * Build a BitcoinSigner from a WIF private key. The derived address MUST be the
 * one that owns the target block on-chain, or registration fails closed (403).
 */
export function walletSigner(wif: string, type: AddressType = 'p2wpkh'): BitcoinSigner {
  const privateKey = privateKeyFromWif(wif);
  const address = addressFromPublicKey(secp256k1.getPublicKey(privateKey, true), type);
  return {
    address,
    async signMessage(message: string): Promise<string> {
      return signBip322(privateKey, address, message);
    },
  };
}

/** Generate a fresh throwaway keypair (testing only — never fund this key). */
export function generateWallet(type: AddressType = 'p2wpkh'): { wif: string; address: string } {
  const privateKey = secp256k1.utils.randomPrivateKey();
  return {
    wif: WIF().encode(privateKey),
    address: addressFromPublicKey(secp256k1.getPublicKey(privateKey, true), type),
  };
}
