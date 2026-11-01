/**
 * Stored key decryption requires the full authentication tag.
 *
 * Guardian LLM keys are stored as `iv:tag:ciphertext` (AES-256-GCM, 16-byte
 * tag). Decryption now refuses a tag of any other length with the existing
 * "Invalid encrypted key format" error, so a value whose tag was cut short no
 * longer decrypts. Encryption is unchanged; every stored value round-trips.
 */

import { encryptApiKey, decryptApiKey } from '@/lib/key-encryption';

const env = { ...process.env };
const FIXTURE_VALUE = 'sk-' + 'x'.repeat(20);

beforeEach(() => {
  process.env.GUARDIAN_ENCRYPTION_KEY = 'a'.repeat(64);
});

afterAll(() => {
  process.env = { ...env };
});

const parts = (stored: string) => {
  const [iv, tag, data] = stored.split(':');
  return { iv, tag, data };
};

describe('decryptApiKey', () => {
  it('the full 16-byte tag round-trips', () => {
    const stored = encryptApiKey(FIXTURE_VALUE);
    expect(parts(stored).tag).toHaveLength(32);
    expect(decryptApiKey(stored)).toBe(FIXTURE_VALUE);
  });

  it('a tag cut to 4 bytes is refused', () => {
    const { iv, tag, data } = parts(encryptApiKey(FIXTURE_VALUE));
    expect(() => decryptApiKey(`${iv}:${tag.slice(0, 8)}:${data}`)).toThrow('Invalid encrypted key format');
  });

  it('a tag cut to 12 bytes is refused', () => {
    const { iv, tag, data } = parts(encryptApiKey(FIXTURE_VALUE));
    expect(() => decryptApiKey(`${iv}:${tag.slice(0, 24)}:${data}`)).toThrow('Invalid encrypted key format');
  });

  it('a tag longer than 16 bytes is refused', () => {
    const { iv, tag, data } = parts(encryptApiKey(FIXTURE_VALUE));
    expect(() => decryptApiKey(`${iv}:${tag}00:${data}`)).toThrow('Invalid encrypted key format');
  });

  it('one changed tag byte still throws', () => {
    const { iv, tag, data } = parts(encryptApiKey(FIXTURE_VALUE));
    const flipped = (parseInt(tag.slice(0, 2), 16) ^ 0x01).toString(16).padStart(2, '0') + tag.slice(2);
    expect(() => decryptApiKey(`${iv}:${flipped}:${data}`)).toThrow();
  });

  it('one changed ciphertext byte still throws', () => {
    const { iv, tag, data } = parts(encryptApiKey(FIXTURE_VALUE));
    const flipped = (parseInt(data.slice(0, 2), 16) ^ 0x01).toString(16).padStart(2, '0') + data.slice(2);
    expect(() => decryptApiKey(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('a missing part is the format error, as before', () => {
    expect(() => decryptApiKey('abc:def')).toThrow('Invalid encrypted key format');
  });
});
