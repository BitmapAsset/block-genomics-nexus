import { CryptoUtils } from '../../src/security/CryptoUtils';
import { MemoryGuard } from '../../src/security/MemoryGuard';
import { InputValidator } from '../../src/security/InputValidator';
import { RateLimiter } from '../../src/security/RateLimiter';
import { AuditLog } from '../../src/security/AuditLog';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('CryptoUtils', () => {
  test('timingSafeEqual returns true for equal buffers', () => {
    const a = Buffer.from('deadbeef', 'hex');
    const b = Buffer.from('deadbeef', 'hex');
    expect(CryptoUtils.timingSafeEqual(a, b)).toBe(true);
  });

  test('timingSafeEqual returns false for different buffers', () => {
    const a = Buffer.from('deadbeef', 'hex');
    const b = Buffer.from('cafebabe', 'hex');
    expect(CryptoUtils.timingSafeEqual(a, b)).toBe(false);
  });

  test('timingSafeEqual returns false for different lengths', () => {
    const a = Buffer.from('deadbeef', 'hex');
    const b = Buffer.from('dead', 'hex');
    expect(CryptoUtils.timingSafeEqual(a, b)).toBe(false);
  });

  test('secureRandom generates correct length', () => {
    const buf = CryptoUtils.secureRandom(32);
    expect(buf.length).toBe(32);
  });

  test('sha256 produces correct hash', () => {
    const hash = CryptoUtils.sha256(Buffer.from('hello'));
    expect(hash.toString('hex')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  test('doubleSha256 produces correct hash', () => {
    const hash = CryptoUtils.doubleSha256(Buffer.from('hello'));
    expect(hash.length).toBe(32);
    // Double SHA256 should differ from single
    const single = CryptoUtils.sha256(Buffer.from('hello'));
    expect(hash.toString('hex')).not.toBe(single.toString('hex'));
  });

  test('encrypt/decrypt roundtrip', () => {
    const key = CryptoUtils.secureRandom(32);
    const plaintext = Buffer.from('self-sovereign wallet data');
    const { iv, ciphertext, tag } = CryptoUtils.encrypt(plaintext, key);
    const decrypted = CryptoUtils.decrypt(ciphertext, key, iv, tag);
    expect(decrypted.toString()).toBe('self-sovereign wallet data');
  });

  test('decrypt with wrong key throws', () => {
    const key = CryptoUtils.secureRandom(32);
    const wrongKey = CryptoUtils.secureRandom(32);
    const plaintext = Buffer.from('secret');
    const { iv, ciphertext, tag } = CryptoUtils.encrypt(plaintext, key);
    expect(() => CryptoUtils.decrypt(ciphertext, wrongKey, iv, tag)).toThrow();
  });

  test('zeroBuffer zeroes all bytes', () => {
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    CryptoUtils.zeroBuffer(buf);
    expect(buf.every(b => b === 0)).toBe(true);
  });
});

describe('MemoryGuard', () => {
  test('dispose zeroes tracked buffers', () => {
    const guard = new MemoryGuard();
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    guard.track(buf);
    guard.dispose();
    expect(buf.every(b => b === 0)).toBe(true);
  });

  test('withGuard auto-disposes', async () => {
    const buf = Buffer.from([0xca, 0xfe]);
    await MemoryGuard.withGuard(async (guard) => {
      guard.track(buf);
    });
    expect(buf.every(b => b === 0)).toBe(true);
  });

  test('cleanup functions are called on dispose', () => {
    const guard = new MemoryGuard();
    let cleaned = false;
    guard.onCleanup(() => { cleaned = true; });
    guard.dispose();
    expect(cleaned).toBe(true);
  });
});

describe('InputValidator', () => {
  test('validateAddress accepts valid mainnet address', () => {
    expect(InputValidator.validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet')).toBe(true);
  });

  test('validateAddress rejects wrong network', () => {
    expect(InputValidator.validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'testnet')).toBe(false);
  });

  test('validateAddress rejects empty string', () => {
    expect(InputValidator.validateAddress('', 'mainnet')).toBe(false);
  });

  test('validateTxid accepts valid txid', () => {
    expect(InputValidator.validateTxid('a'.repeat(64))).toBe(true);
  });

  test('validateTxid rejects short hex', () => {
    expect(InputValidator.validateTxid('abcd')).toBe(false);
  });

  test('validateHex accepts valid hex', () => {
    expect(InputValidator.validateHex('deadbeef')).toBe(true);
  });

  test('validateHex with expected length', () => {
    expect(InputValidator.validateHex('a'.repeat(64), 32)).toBe(true);
    expect(InputValidator.validateHex('a'.repeat(62), 32)).toBe(false);
  });

  test('validatePubkey accepts valid compressed pubkey', () => {
    expect(InputValidator.validatePubkey('02' + 'a'.repeat(64))).toBe(true);
    expect(InputValidator.validatePubkey('03' + 'b'.repeat(64))).toBe(true);
  });

  test('validatePubkey rejects invalid prefix', () => {
    expect(InputValidator.validatePubkey('04' + 'a'.repeat(64))).toBe(false);
  });

  test('validateAmount rejects non-positive', () => {
    expect(InputValidator.validateAmount(0n)).toBe(false);
    expect(InputValidator.validateAmount(-1n)).toBe(false);
    expect(InputValidator.validateAmount(1n)).toBe(true);
  });

  test('validatePort', () => {
    expect(InputValidator.validatePort(8080)).toBe(true);
    expect(InputValidator.validatePort(0)).toBe(false);
    expect(InputValidator.validatePort(70000)).toBe(false);
  });

  test('sanitizeString strips non-printable', () => {
    expect(InputValidator.sanitizeString('hello\x00world')).toBe('helloworld');
  });

  test('sanitizeString respects maxLength', () => {
    expect(InputValidator.sanitizeString('abcdefgh', 5)).toBe('abcde');
  });
});

describe('RateLimiter', () => {
  test('allows first attempt', () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.isAllowed('test')).toBe(true);
  });

  test('blocks after max failed attempts', () => {
    const limiter = new RateLimiter(2, 5000);
    limiter.recordAttempt('test', false);
    limiter.recordAttempt('test', false);
    expect(limiter.isAllowed('test')).toBe(false);
  });

  test('resets on successful attempt', () => {
    const limiter = new RateLimiter(3, 5000);
    limiter.recordAttempt('test', false);
    limiter.recordAttempt('test', true);
    expect(limiter.isAllowed('test')).toBe(true);
  });

  test('getRemainingLockout returns 0 when not locked', () => {
    const limiter = new RateLimiter();
    expect(limiter.getRemainingLockout('test')).toBe(0);
  });

  test('getRemainingLockout returns positive when locked', () => {
    const limiter = new RateLimiter(1, 5000);
    limiter.recordAttempt('test', false);
    expect(limiter.getRemainingLockout('test')).toBeGreaterThan(0);
  });

  test('reset clears state', () => {
    const limiter = new RateLimiter(1, 5000);
    limiter.recordAttempt('test', false);
    limiter.reset('test');
    expect(limiter.isAllowed('test')).toBe(true);
  });
});

describe('AuditLog', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runebolt-test-'));
    logPath = path.join(tmpDir, 'audit.log');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('log creates an entry with hash chain', () => {
    const log = new AuditLog(logPath);
    const entry = log.log('test_action', { key: 'value' });
    expect(entry.action).toBe('test_action');
    expect(entry.hash).toBeTruthy();
    expect(entry.previousHash).toBe('0'.repeat(64));
  });

  test('log chains hashes', () => {
    const log = new AuditLog(logPath);
    const first = log.log('first');
    const second = log.log('second');
    expect(second.previousHash).toBe(first.hash);
  });

  test('verify returns valid for correct chain', () => {
    const log = new AuditLog(logPath);
    log.log('one');
    log.log('two');
    log.log('three');
    const result = log.verify();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3);
  });

  test('verify detects tampering', () => {
    const log = new AuditLog(logPath);
    log.log('one');
    log.log('two');

    // Tamper with the log
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    entry.action = 'tampered';
    lines[0] = JSON.stringify(entry);
    fs.writeFileSync(logPath, lines.join('\n') + '\n');

    const log2 = new AuditLog(logPath);
    const result = log2.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  test('verify returns valid for empty log', () => {
    const log = new AuditLog(logPath);
    expect(log.verify().valid).toBe(true);
    expect(log.verify().entries).toBe(0);
  });

  test('redacts sensitive fields', () => {
    const log = new AuditLog(logPath);
    const entry = log.log('test', { password: 'secret', mnemonic: 'words', safe: 'ok' });
    expect(entry.details.password).toBe('[REDACTED]');
    expect(entry.details.mnemonic).toBe('[REDACTED]');
    expect(entry.details.safe).toBe('ok');
  });
});
