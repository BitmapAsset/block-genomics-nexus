/**
 * BIP-322 verification unit tests — real keypairs, real signatures, no network.
 *
 * Covers the gate that stands between "an agent connected" and "an agent may
 * write": if this accepts a signature it should not, ownership proof is
 * worthless. So the negative cases (wrong wallet, tampered message, mutated
 * signature) matter more here than the happy path.
 */

import { verifyBip322, signatureCandidates, MAX_SIGNATURE_CHARS } from '@/lib/bip322';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { makeWallet, sign, challengeMessage, freshNonce, type AddrKind } from '../helpers/wallet-sim';

const KINDS: AddrKind[] = ['p2pkh', 'p2wpkh', 'p2tr'];

describe('verifyBip322 — valid signatures', () => {
  it.each(KINDS)('accepts a genuine %s signature', (kind) => {
    const w = makeWallet(kind);
    const message = challengeMessage(freshNonce());
    expect(verifyBip322(w.address, message, sign(w.wif, w.address, message))).toBe(true);
  });
});

describe('verifyBip322 — wrong wallet', () => {
  it.each(KINDS)('rejects a valid %s signature presented for another address', (kind) => {
    const signer = makeWallet(kind);
    const impostor = makeWallet(kind);
    const message = challengeMessage(freshNonce());
    const signature = sign(signer.wif, signer.address, message);

    // The signature is cryptographically real — it just belongs to someone else.
    expect(verifyBip322(signer.address, message, signature)).toBe(true);
    expect(verifyBip322(impostor.address, message, signature)).toBe(false);
  });

  it('rejects cross-address-type reuse of the same key', () => {
    const w = makeWallet('p2wpkh');
    const other = makeWallet('p2tr');
    const message = challengeMessage(freshNonce());
    expect(verifyBip322(other.address, message, sign(w.wif, w.address, message))).toBe(false);
  });
});

describe('verifyBip322 — invalid signatures', () => {
  const w = makeWallet('p2tr');
  const message = challengeMessage(freshNonce());

  it('rejects a signature over a different message', () => {
    const signature = sign(w.wif, w.address, challengeMessage(freshNonce()));
    expect(verifyBip322(w.address, message, signature)).toBe(false);
  });

  it('rejects a tampered message (nonce swapped after signing)', () => {
    const signature = sign(w.wif, w.address, message);
    expect(verifyBip322(w.address, `${message}x`, signature)).toBe(false);
  });

  it('rejects a bit-flipped signature', () => {
    const signature = sign(w.wif, w.address, message);
    const bytes = Buffer.from(signature, 'base64');
    bytes[bytes.length - 1] ^= 0x01;
    expect(verifyBip322(w.address, message, bytes.toString('base64'))).toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n\t '],
    ['not base64 at all', 'definitely-not-a-signature!!'],
    ['truncated base64', 'AkcwRAIg'],
  ])('rejects %s', (_label, signature) => {
    expect(verifyBip322(w.address, message, signature)).toBe(false);
  });

  it.each([
    ['missing address', '', message, 'AkcwRAIg'],
    ['missing message', w.address, '', 'AkcwRAIg'],
    ['missing signature', w.address, message, ''],
  ])('rejects %s', (_label, address, msg, signature) => {
    expect(verifyBip322(address, msg, signature)).toBe(false);
  });

  it('rejects an oversized signature without attempting verification', () => {
    expect(verifyBip322(w.address, message, 'A'.repeat(MAX_SIGNATURE_CHARS + 1))).toBe(false);
  });

  it('rejects an oversized message', () => {
    const huge = 'x'.repeat(5000);
    expect(verifyBip322(w.address, huge, sign(w.wif, w.address, huge))).toBe(false);
  });
});

describe('verifyBip322 — wallet encoding variants', () => {
  const w = makeWallet('p2wpkh');
  const message = challengeMessage(freshNonce());
  const base64 = sign(w.wif, w.address, message);

  it('accepts standard base64 (Xverse, Unisat, OKX, Magic Eden)', () => {
    expect(verifyBip322(w.address, message, base64)).toBe(true);
  });

  it('accepts lowercase hex (Leather and CLI signers)', () => {
    const hex = Buffer.from(base64, 'base64').toString('hex');
    expect(verifyBip322(w.address, message, hex)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const hex = Buffer.from(base64, 'base64').toString('hex').toUpperCase();
    expect(verifyBip322(w.address, message, hex)).toBe(true);
  });

  it('accepts base64url (survived a URL or JWT round-trip)', () => {
    const b64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    expect(verifyBip322(w.address, message, b64url)).toBe(true);
  });

  it('accepts a signature wrapped in newlines (copy-paste / YAML block)', () => {
    const wrapped = `\n  ${base64.slice(0, 40)}\n  ${base64.slice(40)}\n`;
    expect(verifyBip322(w.address, message, wrapped)).toBe(true);
  });

  it('still rejects a wrong-wallet signature in every encoding', () => {
    const impostor = makeWallet('p2wpkh');
    const hex = Buffer.from(base64, 'base64').toString('hex');
    const b64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    for (const variant of [base64, hex, b64url]) {
      expect(verifyBip322(impostor.address, message, variant)).toBe(false);
    }
  });
});

describe('signatureCandidates', () => {
  it('strips interior whitespace', () => {
    expect(signatureCandidates(' ab\ncd ')).toContain('abcd');
  });

  it('never emits more than three candidates', () => {
    expect(signatureCandidates('deadbeef').length).toBeLessThanOrEqual(3);
  });

  it('offers the hex reading in ADDITION to the literal one, never instead', () => {
    // "deadbeef" is simultaneously valid hex and valid base64; both must be tried.
    const candidates = signatureCandidates('deadbeef');
    expect(candidates[0]).toBe('deadbeef');
    expect(candidates).toContain(Buffer.from('deadbeef', 'hex').toString('base64'));
  });

  it('maps base64url characters back to standard base64', () => {
    expect(signatureCandidates('ab-cd_ef')).toContain('ab+cd/ef');
  });

  it('returns nothing for empty or oversized input', () => {
    expect(signatureCandidates('')).toEqual([]);
    expect(signatureCandidates('   ')).toEqual([]);
    expect(signatureCandidates('A'.repeat(MAX_SIGNATURE_CHARS + 1))).toEqual([]);
  });

  it('does not treat odd-length hex as hex', () => {
    expect(signatureCandidates('abc')).toEqual(['abc']);
  });
});

describe('verifyWalletSignature delegates to the shared verifier', () => {
  it('gains multi-encoding support for every existing caller', () => {
    const w = makeWallet('p2tr');
    const message = challengeMessage(freshNonce());
    const base64 = sign(w.wif, w.address, message);
    const hex = Buffer.from(base64, 'base64').toString('hex');

    expect(verifyWalletSignature(w.address, message, base64)).toBe(true);
    expect(verifyWalletSignature(w.address, message, hex)).toBe(true);
    expect(verifyWalletSignature(makeWallet('p2tr').address, message, base64)).toBe(false);
  });
});
