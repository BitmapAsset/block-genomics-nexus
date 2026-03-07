import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as bip39 from 'bip39';
import { createLogger } from '../utils/logger';
import { BitcoinNetwork, WalletAddress } from '../types';
import { CryptoUtils, MemoryGuard } from '../security';

const log = createLogger('KeyManager');
const bip32 = BIP32Factory(ecc);

bitcoin.initEccLib(ecc);

export class KeyManager {
  private masterKey: BIP32Interface | null = null;
  private readonly network: bitcoin.Network;
  private readonly networkName: BitcoinNetwork;

  constructor(network: BitcoinNetwork) {
    this.networkName = network;
    this.network = network === 'mainnet' ? bitcoin.networks.bitcoin
      : network === 'testnet' ? bitcoin.networks.testnet
      : bitcoin.networks.regtest;
  }

  /**
   * Generate a new 24-word BIP-39 mnemonic.
   * The mnemonic is returned ONCE - caller must store it securely.
   */
  generateMnemonic(): string {
    return bip39.generateMnemonic(256);
  }

  /**
   * Initialize from mnemonic. The mnemonic is used to derive the master key,
   * then should be zeroed from memory by the caller.
   */
  async initFromMnemonic(mnemonic: string, passphrase: string = ''): Promise<void> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid BIP-39 mnemonic');
    }
    const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
    this.masterKey = bip32.fromSeed(Buffer.from(seed), this.network);
    // Zero the seed buffer
    CryptoUtils.zeroBuffer(Buffer.from(seed));
    log.info('Wallet initialized from mnemonic');
  }

  /**
   * Initialize from serialized xprv (for wallet file loading).
   */
  initFromXprv(xprv: string): void {
    this.masterKey = bip32.fromBase58(xprv, this.network);
    log.info('Wallet initialized from xprv');
  }

  /**
   * Export xprv for encrypted storage. Returns it and caller must handle securely.
   */
  exportXprv(): string {
    this.ensureUnlocked();
    return this.masterKey!.toBase58();
  }

  /**
   * Get master fingerprint (safe to expose).
   */
  getFingerprint(): string {
    this.ensureUnlocked();
    return this.masterKey!.fingerprint.toString('hex');
  }

  /**
   * Derive a Taproot (BIP-86) address: m/86'/0'/0'/0/index
   */
  deriveTaprootAddress(index: number): WalletAddress {
    this.ensureUnlocked();
    const coinType = this.networkName === 'mainnet' ? 0 : 1;
    const path = `m/86'/${coinType}'/0'/0/${index}`;
    const child = this.masterKey!.derivePath(path);

    const pubkey = child.publicKey;
    // x-only pubkey for Taproot (strip the prefix byte)
    const xOnlyPubkey = pubkey.subarray(1, 33);
    const { address } = bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
      network: this.network,
    });

    if (!address) throw new Error('Failed to derive Taproot address');

    return { path, address, type: 'p2tr', index };
  }

  /**
   * Derive a segwit (BIP-84) address: m/84'/0'/0'/0/index
   */
  deriveSegwitAddress(index: number): WalletAddress {
    this.ensureUnlocked();
    const coinType = this.networkName === 'mainnet' ? 0 : 1;
    const path = `m/84'/${coinType}'/0'/0/${index}`;
    const child = this.masterKey!.derivePath(path);

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.network,
    });

    if (!address) throw new Error('Failed to derive segwit address');

    return { path, address, type: 'p2wpkh', index };
  }

  /**
   * Get the keypair for signing at a given derivation path.
   * Returns the ECPair. Caller MUST use MemoryGuard to track the private key.
   */
  getSigningKey(derivationPath: string): { privateKey: Buffer; publicKey: Buffer } {
    this.ensureUnlocked();
    const child = this.masterKey!.derivePath(derivationPath);
    if (!child.privateKey) throw new Error('Cannot derive private key');
    return {
      privateKey: Buffer.from(child.privateKey),
      publicKey: Buffer.from(child.publicKey),
    };
  }

  /**
   * Get x-only public key for Taproot at given path.
   */
  getTaprootPubkey(derivationPath: string): Buffer {
    this.ensureUnlocked();
    const child = this.masterKey!.derivePath(derivationPath);
    return child.publicKey.subarray(1, 33);
  }

  /**
   * Lock the wallet - zero the master key from memory.
   */
  lock(): void {
    if (this.masterKey) {
      // BIP32 doesn't expose a way to zero internal state,
      // but we null the reference
      this.masterKey = null;
      log.info('Wallet locked');
    }
  }

  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  private ensureUnlocked(): void {
    if (!this.masterKey) {
      throw new Error('Wallet is locked. Unlock before performing key operations.');
    }
  }
}
