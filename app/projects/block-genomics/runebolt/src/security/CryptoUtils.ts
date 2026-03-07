import crypto from 'crypto';

export class CryptoUtils {
  /**
   * Constant-time comparison to prevent timing attacks.
   */
  static timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      // Compare against dummy to maintain constant time even on length mismatch
      const dummy = Buffer.alloc(a.length);
      crypto.timingSafeEqual(a, dummy);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  static secureRandom(bytes: number): Buffer {
    return crypto.randomBytes(bytes);
  }

  static sha256(data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  }

  static doubleSha256(data: Buffer): Buffer {
    return CryptoUtils.sha256(CryptoUtils.sha256(data));
  }

  static hmacSha256(key: Buffer, data: Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  /**
   * AES-256-GCM encryption.
   */
  static encrypt(plaintext: Buffer, key: Buffer): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv, ciphertext, tag };
  }

  /**
   * AES-256-GCM decryption.
   */
  static decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Zero out a buffer to prevent secrets lingering in memory.
   */
  static zeroBuffer(buf: Buffer): void {
    buf.fill(0);
  }
}
