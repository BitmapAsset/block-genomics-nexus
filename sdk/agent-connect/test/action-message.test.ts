import { describe, it, expect } from 'vitest';
import { buildActionMessage, hashBody, stableStringify, sha256Hex } from '../src/index.js';

describe('buildActionMessage', () => {
  it('produces the exact canonical, newline-joined string the server verifies', async () => {
    const msg = buildActionMessage({
      action: 'world.create',
      method: 'post',
      path: '/api/v1/world',
      blockHeight: 840000,
      bodyHash: 'abc123',
      nonce: 'NONCE',
      expiresAt: 1_700_000_000_000,
    });
    expect(msg).toBe(
      [
        'Block Genomics Authorization v1',
        'Action: world.create',
        'Method: POST', // method is uppercased
        'Path: /api/v1/world',
        'Block: 840000',
        'Body: abc123',
        'Nonce: NONCE',
        'Expires: 1700000000000',
      ].join('\n'),
    );
  });
});

describe('stableStringify', () => {
  it('sorts object keys deterministically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('drops undefined-valued keys (mirrors JSON.stringify round-trip)', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it('is stable under key reordering (same hash input regardless of insertion order)', () => {
    expect(stableStringify({ x: 1, y: 2 })).toBe(stableStringify({ y: 2, x: 1 }));
  });
});

describe('hashBody', () => {
  it('excludes the auth-envelope fields (signature, message) from the intent hash', async () => {
    const withAuth = await hashBody({ color: '#fff', signature: 'sig', message: 'msg' });
    const without = await hashBody({ color: '#fff' });
    expect(withAuth).toBe(without);
  });
  it('changes when an intent field changes', async () => {
    const a = await hashBody({ color: '#fff' });
    const b = await hashBody({ color: '#000' });
    expect(a).not.toBe(b);
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
