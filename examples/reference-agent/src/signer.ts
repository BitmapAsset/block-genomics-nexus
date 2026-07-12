// The agent's BIP-322 signer — the ONE place this program touches key material.
//
// Block Genomics never sees the private key. The SDK only ever calls
// signMessage() to obtain a BIP-322 signature over a server-issued challenge.
// We sign with `bip322-js`, the same library the server verifies with, so a
// signature produced here is guaranteed to pass server-side verification.

import bip322 from 'bip322-js';
import ecpairPkg from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import type { BitcoinSigner } from 'block-genomics-connect';

const { Signer, Address } = bip322;
// ecpair ships both a named and default factory export across versions; accept either.
const ECPairFactory =
  (ecpairPkg as { ECPairFactory?: typeof import('ecpair').ECPairFactory }).ECPairFactory ??
  (ecpairPkg as unknown as typeof import('ecpair').ECPairFactory);
const ECPair = ECPairFactory(ecc);

export type AddressType = 'p2wpkh' | 'p2tr' | 'p2pkh';

function deriveAddress(publicKey: Buffer | Uint8Array, type: AddressType): string {
  // bip322-js returns { mainnet, testnet, regtest }; the protocol is mainnet.
  return Address.convertPubKeyIntoAddress(publicKey as Buffer, type).mainnet;
}

/**
 * Build a BitcoinSigner from a WIF private key. The derived address MUST be the
 * one that owns the target block on-chain, or registration fails closed (403).
 */
export function walletSigner(wif: string, type: AddressType = 'p2wpkh'): BitcoinSigner {
  const keyPair = ECPair.fromWIF(wif);
  const address = deriveAddress(keyPair.publicKey, type);
  return {
    address,
    async signMessage(message: string): Promise<string> {
      const sig = Signer.sign(wif, address, message);
      // bip322-js returns a base64 string for most inputs, occasionally a Buffer.
      return typeof sig === 'string' ? sig : Buffer.from(sig as Uint8Array).toString('base64');
    },
  };
}

/** Generate a fresh throwaway keypair (testing only — never fund this key). */
export function generateWallet(type: AddressType = 'p2wpkh'): { wif: string; address: string } {
  const keyPair = ECPair.makeRandom();
  return { wif: keyPair.toWIF(), address: deriveAddress(keyPair.publicKey, type) };
}
