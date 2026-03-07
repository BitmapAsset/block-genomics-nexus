import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { createLogger } from '../utils/logger';
import { MemoryGuard, CryptoUtils } from '../security';
import { Utxo, BitcoinNetwork } from '../types';
import { KeyManager } from './KeyManager';

const log = createLogger('SigningEngine');

bitcoin.initEccLib(ecc);

export interface TxInput {
  utxo: Utxo;
  derivationPath: string;
}

export interface TxOutput {
  address: string;
  value: number;
}

export class SigningEngine {
  private readonly keyManager: KeyManager;
  private readonly network: bitcoin.Network;

  constructor(keyManager: KeyManager, network: BitcoinNetwork) {
    this.keyManager = keyManager;
    this.network = network === 'mainnet' ? bitcoin.networks.bitcoin
      : network === 'testnet' ? bitcoin.networks.testnet
      : bitcoin.networks.regtest;
  }

  /**
   * Build and sign a Taproot transaction. All signing happens locally.
   * Private keys are zeroed from memory after signing.
   */
  async signTaprootTx(inputs: TxInput[], outputs: TxOutput[]): Promise<string> {
    return MemoryGuard.withGuard(async (guard) => {
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Add inputs
      for (const input of inputs) {
        const { privateKey, publicKey } = this.keyManager.getSigningKey(input.derivationPath);
        guard.track(privateKey);

        const xOnlyPubkey = publicKey.subarray(1, 33);
        const { output } = bitcoin.payments.p2tr({
          internalPubkey: xOnlyPubkey,
          network: this.network,
        });

        if (!output) throw new Error('Failed to create P2TR output script');

        psbt.addInput({
          hash: input.utxo.txid,
          index: input.utxo.vout,
          witnessUtxo: {
            script: output,
            value: input.utxo.value,
          },
          tapInternalKey: xOnlyPubkey,
        });
      }

      // Add outputs
      for (const output of outputs) {
        psbt.addOutput({
          address: output.address,
          value: output.value,
        });
      }

      // Sign all inputs
      for (let i = 0; i < inputs.length; i++) {
        const { privateKey } = this.keyManager.getSigningKey(inputs[i].derivationPath);
        guard.track(privateKey);

        const tweakedSigner = this.createTweakedSigner(privateKey);
        psbt.signInput(i, tweakedSigner);
      }

      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      log.info({ txid: tx.getId(), vsize: tx.virtualSize() }, 'Transaction signed');
      return tx.toHex();
    });
  }

  /**
   * Sign a segwit (P2WPKH) transaction.
   */
  async signSegwitTx(inputs: TxInput[], outputs: TxOutput[]): Promise<string> {
    return MemoryGuard.withGuard(async (guard) => {
      const psbt = new bitcoin.Psbt({ network: this.network });

      for (const input of inputs) {
        const { publicKey } = this.keyManager.getSigningKey(input.derivationPath);
        const { output } = bitcoin.payments.p2wpkh({
          pubkey: publicKey,
          network: this.network,
        });

        if (!output) throw new Error('Failed to create P2WPKH output script');

        psbt.addInput({
          hash: input.utxo.txid,
          index: input.utxo.vout,
          witnessUtxo: {
            script: output,
            value: input.utxo.value,
          },
        });
      }

      for (const output of outputs) {
        psbt.addOutput({
          address: output.address,
          value: output.value,
        });
      }

      for (let i = 0; i < inputs.length; i++) {
        const { privateKey } = this.keyManager.getSigningKey(inputs[i].derivationPath);
        guard.track(privateKey);
        psbt.signInput(i, {
          publicKey: this.keyManager.getSigningKey(inputs[i].derivationPath).publicKey,
          sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privateKey)),
        });
      }

      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      log.info({ txid: tx.getId(), vsize: tx.virtualSize() }, 'Segwit transaction signed');
      return tx.toHex();
    });
  }

  /**
   * Estimate transaction fee.
   */
  estimateFee(inputCount: number, outputCount: number, feeRate: number, taproot: boolean = true): number {
    // Taproot input: ~57.5 vbytes, P2WPKH input: ~68 vbytes
    // P2TR output: ~43 vbytes, P2WPKH output: ~31 vbytes
    const inputVbytes = taproot ? 57.5 : 68;
    const outputVbytes = taproot ? 43 : 31;
    const overhead = 10.5; // tx overhead
    const vsize = Math.ceil(overhead + inputCount * inputVbytes + outputCount * outputVbytes);
    return Math.ceil(vsize * feeRate);
  }

  private createTweakedSigner(privateKey: Buffer): bitcoin.Signer {
    const pubkey = Buffer.from(ecc.pointFromScalar(privateKey)!);
    const xOnlyPubkey = pubkey.subarray(1, 33);

    // Tweak the private key for keypath spending
    const tweakHash = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey);
    const tweakedPrivKey = Buffer.from(ecc.privateAdd(privateKey, tweakHash)!);

    return {
      publicKey: pubkey,
      sign: (hash: Buffer) => Buffer.from(ecc.signSchnorr(hash, tweakedPrivKey)),
    };
  }
}
