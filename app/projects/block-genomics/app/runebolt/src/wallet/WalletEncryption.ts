import fs from 'fs';
import path from 'path';
import argon2 from 'argon2';
import { createLogger } from '../utils/logger';
import { CryptoUtils, MemoryGuard } from '../security';
import { EncryptedWallet } from '../types';

const log = createLogger('WalletEncryption');

const WALLET_VERSION = 1;
const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY_COST = 65536; // 64MB
const ARGON2_PARALLELISM = 4;
const SALT_LENGTH = 32;

export class WalletEncryption {
  /**
   * Encrypt wallet data (xprv) with password using argon2id + AES-256-GCM.
   */
  static async encrypt(data: string, password: string): Promise<EncryptedWallet> {
    return MemoryGuard.withGuard(async (guard) => {
      const salt = CryptoUtils.secureRandom(SALT_LENGTH);

      // Derive encryption key using argon2id
      const keyBuffer = await argon2.hash(password, {
        type: argon2.argon2id,
        salt,
        timeCost: ARGON2_TIME_COST,
        memoryCost: ARGON2_MEMORY_COST,
        parallelism: ARGON2_PARALLELISM,
        hashLength: 32,
        raw: true,
      });
      const key = Buffer.from(keyBuffer);
      guard.track(key);

      const plaintext = Buffer.from(data, 'utf-8');
      guard.track(plaintext);

      const { iv, ciphertext, tag } = CryptoUtils.encrypt(plaintext, key);

      return {
        version: WALLET_VERSION,
        salt,
        iv,
        ciphertext,
        tag,
        argon2Params: {
          timeCost: ARGON2_TIME_COST,
          memoryCost: ARGON2_MEMORY_COST,
          parallelism: ARGON2_PARALLELISM,
        },
      };
    });
  }

  /**
   * Decrypt wallet data with password.
   */
  static async decrypt(wallet: EncryptedWallet, password: string): Promise<string> {
    return MemoryGuard.withGuard(async (guard) => {
      const keyBuffer = await argon2.hash(password, {
        type: argon2.argon2id,
        salt: wallet.salt,
        timeCost: wallet.argon2Params.timeCost,
        memoryCost: wallet.argon2Params.memoryCost,
        parallelism: wallet.argon2Params.parallelism,
        hashLength: 32,
        raw: true,
      });
      const key = Buffer.from(keyBuffer);
      guard.track(key);

      const plaintext = CryptoUtils.decrypt(wallet.ciphertext, key, wallet.iv, wallet.tag);
      guard.track(plaintext);

      return plaintext.toString('utf-8');
    });
  }

  /**
   * Save encrypted wallet to disk.
   */
  static save(wallet: EncryptedWallet, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const serialized = JSON.stringify({
      version: wallet.version,
      salt: wallet.salt.toString('hex'),
      iv: wallet.iv.toString('hex'),
      ciphertext: wallet.ciphertext.toString('hex'),
      tag: wallet.tag.toString('hex'),
      argon2Params: wallet.argon2Params,
    });

    fs.writeFileSync(filePath, serialized, { mode: 0o600 });
    log.info({ path: filePath }, 'Wallet file saved');
  }

  /**
   * Load encrypted wallet from disk.
   */
  static load(filePath: string): EncryptedWallet {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wallet file not found: ${filePath}`);
    }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      version: raw.version,
      salt: Buffer.from(raw.salt, 'hex'),
      iv: Buffer.from(raw.iv, 'hex'),
      ciphertext: Buffer.from(raw.ciphertext, 'hex'),
      tag: Buffer.from(raw.tag, 'hex'),
      argon2Params: raw.argon2Params,
    };
  }

  /**
   * Check if a wallet file exists.
   */
  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }
}
