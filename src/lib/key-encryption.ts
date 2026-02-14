import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.GUARDIAN_ENCRYPTION_KEY;
  if (!key) throw new Error('GUARDIAN_ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

export function encryptApiKey(plainKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

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

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  return 'sk-••••••••';
}
