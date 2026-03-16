/**
 * AES-256-GCM encryption for Guardian LLM API keys at rest.
 * Keys are encrypted before database storage and decrypted on use.
 *
 * Storage format: `${iv}:${authTag}:${ciphertext}` (all hex-encoded)
 * Encryption key: GUARDIAN_ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV per NIST SP 800-38D for AES-GCM
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.GUARDIAN_ENCRYPTION_KEY;
  if (!key) throw new Error('GUARDIAN_ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt an LLM API key using AES-256-GCM.
 * @param plainKey - Plaintext API key (e.g., "sk-ant-...")
 * @returns Encrypted string in format `iv:tag:ciphertext` (hex)
 */
export function encryptApiKey(plainKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted API key.
 * @param encryptedStr - Encrypted string in format `iv:tag:ciphertext` (hex)
 * @returns Plaintext API key
 * @throws If format is invalid or decryption fails (tampered data)
 */
export function decryptApiKey(encryptedStr: string): string {
  const [ivHex, tagHex, dataHex] = encryptedStr.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted key format');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/** Mask an API key for safe display (e.g., "sk-••••••••"). */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  return 'sk-••••••••';
}
